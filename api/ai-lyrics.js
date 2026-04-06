/**
 * /api/ai-lyrics — AI 가사 생성 전용 엔드포인트
 *
 * 기존 클라이언트 폴링 방식의 문제점을 개선:
 * - 서버에서 빠른 폴링(5회) 처리 → 빠른 응답 케이스는 왕복 1회로 완료
 * - Gemini 폴백을 서버에서 직접 처리 (언어 감지 포함)
 * - 느린 케이스는 taskId 반환 → 클라이언트 폴링으로 이어감
 *
 * POST /api/ai-lyrics
 * body: { prompt, language?, refArtist?, callBackUrl? }
 * returns:
 *   { status: 'ok', text, source: 'kie'|'gemini' }    — 완료
 *   { status: 'pending', taskId }                      — 클라이언트가 계속 폴링
 *   { status: 'ok', text: '' }                         — 완전 실패
 */

import { withSentry } from './lib/sentry.js';

const KIE_API_KEY = process.env.KIE_API_KEY;
const KIE_BASE = 'https://api.kie.ai';

/* ── kie.ai 공통 fetch ── */
async function kiePost(path, body) {
  const res = await fetch(KIE_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KIE_API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`kie.ai POST ${path} → ${res.status}`);
  return res.json();
}

async function kieGet(path) {
  const res = await fetch(KIE_BASE + path, {
    headers: { 'Authorization': `Bearer ${KIE_API_KEY}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`kie.ai GET ${path} → ${res.status}`);
  return res.json();
}

/* ── kie.ai 응답에서 가사 텍스트 추출 ── */
function extractText(d) {
  if (!d) return '';
  const isValid = (t) => t && t.length > 10 && !/[\ufffd]{3,}/.test(t) && /[\uAC00-\uD7AF]|[a-zA-Z]/.test(t);

  if (d.response?.text && isValid(d.response.text)) return d.response.text;
  if (d.text && isValid(d.text)) return d.text;

  if (Array.isArray(d.response?.data)) {
    for (const item of d.response.data) {
      const t = item.text || item.lyric || '';
      if (isValid(t)) return t;
    }
  }
  if (Array.isArray(d.data)) {
    for (const item of d.data) {
      const t = item.text || item.lyric || item.lyrics || '';
      if (isValid(t)) return t;
    }
  }
  if (Array.isArray(d.response?.sunoData)) {
    for (const item of d.response.sunoData) {
      const t = item.text || item.lyric || '';
      if (isValid(t)) return t;
    }
  }
  /* 유효성 무시 폴백 */
  return d.response?.text || d.text || d.response?.data?.[0]?.text || d.data?.[0]?.text || '';
}

/* ── Gemini 가사 생성 폴백 (언어 감지 포함) ── */
async function geminiLyrics(prompt, language, refArtist) {
  const lang = language || '';
  const isJapanese = /Japanese|日本語/i.test(lang + prompt);
  const isChinese  = /Chinese|中文/i.test(lang + prompt);
  const langName = isJapanese ? '일본어' : isChinese ? '중국어' : '한국어';
  const langInst = isJapanese ? '日本語で' : isChinese ? '用中文' : '한국어로';
  const artistHint = refArtist ? ` 아티스트 스타일: ${refArtist} 느낌으로.` : '';

  const messages = [
    {
      role: 'system',
      content: `당신은 전문 작사가입니다. ${langName} 노래 가사를 [Verse 1], [Chorus], [Verse 2], [Bridge] 구조로 작성하세요. 가사만 출력하고 설명은 하지 마세요.`,
    },
    {
      role: 'user',
      content: `다음 테마/분위기로 감성적인 노래 가사를 ${langInst} 작성해주세요: "${prompt}"${artistHint}`,
    },
  ];

  const res = await fetch(`${KIE_BASE}/gemini-2.5-flash/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KIE_API_KEY}` },
    body: JSON.stringify({ messages, stream: false }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Gemini → ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

/* ── sleep helper ── */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default withSentry(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, language, refArtist, callBackUrl } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  if (!KIE_API_KEY) return res.status(500).json({ error: 'KIE_API_KEY not configured' });

  const safePrompt   = (prompt || '').slice(0, 200);
  const callbackUrl  = callBackUrl || 'https://ddinggok.com/api/callback';

  let text   = '';
  let taskId = null;

  /* ── 1차: kie.ai lyrics → 서버에서 빠른 폴링 (5회, ~4초) ── */
  try {
    const ld = await kiePost('/api/v1/lyrics', { prompt: safePrompt, callBackUrl: callbackUrl });
    taskId = ld?.data?.taskId || ld?.taskId || null;

    if (taskId) {
      for (let i = 0; i < 5; i++) {
        await sleep(i < 2 ? 400 : 800);
        try {
          let d = null;
          try {
            const r = await kieGet(`/api/v1/lyrics/record-info?taskId=${taskId}`);
            d = r?.data;
          } catch {
            const r2 = await kieGet(`/api/v1/jobs/recordInfo?taskId=${taskId}`);
            d = r2?.data;
          }
          if (!d) continue;
          const st = (d.status || d.callbackType || '').toUpperCase();
          if (st === 'SUCCESS' || st === 'COMPLETE') {
            text = extractText(d);
            if (text) { taskId = null; break; }
          }
          /* FIX: includes() 로 FAILED_RETRY, ERROR_TIMEOUT 등도 감지 */
          if (st.includes('FAILED') || st.includes('ERROR')) { taskId = null; break; }
        } catch { /* 개별 폴링 실패는 무시, 계속 */ }
      }
    }
  } catch (e) {
    console.warn('[ai-lyrics] kie.ai 초기 요청 실패:', e.message);
    taskId = null;
  }

  /* 빠른 성공 — 텍스트 바로 반환 */
  if (text) return res.status(200).json({ status: 'ok', text, source: 'kie' });

  /* kie.ai 태스크 아직 진행 중 — 클라이언트가 계속 폴링하도록 taskId 반환 */
  if (taskId) return res.status(200).json({ status: 'pending', taskId });

  /* ── 2차: Gemini 폴백 (언어 감지 포함) ── */
  try {
    text = await geminiLyrics(safePrompt, language || '', refArtist || '');
    if (text) return res.status(200).json({ status: 'ok', text, source: 'gemini' });
  } catch (e) {
    console.warn('[ai-lyrics] Gemini 폴백 실패:', e.message);
  }

  /* 완전 실패 */
  return res.status(200).json({ status: 'ok', text: '', source: 'failed' });
});
