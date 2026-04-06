/**
 * /api/ai-recommend — Gemini 기반 음악 스타일 추천 엔드포인트
 *
 * 기존 클라이언트 키워드 매칭의 한계 개선:
 * - 단순 정규식 매칭 → Gemini 의미 분석으로 정확도 향상
 * - 로컬 매칭을 빠른 폴백으로 유지
 * - 가사/분위기/장르 입력으로 5개 스타일 태그 반환
 *
 * POST /api/ai-recommend
 * body: { lyrics?, mood?, genre?, language? }
 * returns: { styles: string[], source: 'gemini'|'local' }
 */

import { withSentry } from './lib/sentry.js';

const KIE_API_KEY = process.env.KIE_API_KEY;
const KIE_BASE    = 'https://api.kie.ai';

/* ── 로컬 키워드 매칭 (폴백용) ── */
const LOCAL_MAP = {
  '사랑|너를|그리움|이별|눈물|마음':   'ballad, emotional, piano, soft, melancholic',
  '밤|새벽|달|별|꿈|몽환':            'dreamy, ambient, lo-fi, ethereal, atmospheric',
  '거리|도시|네온|카페|레트로':        'city pop, retro, chill, 80s, groove',
  '춤|파티|신나|에너지|댄스':          'dance, upbeat, synth pop, energetic, club',
  '슬픔|외로|혼자|비|쓸쓸':           'sad, melancholy, acoustic guitar, indie, quiet',
  '분노|강한|불꽃|저항':               'rock, aggressive, electric guitar, intense, powerful',
  '바다|여름|햇살|파도|열대':          'tropical, summer, bright, beach, bossa nova',
  '힙합|래퍼|마이크|비트|스웨그':      'hip-hop, trap, 808 bass, urban, rap',
  '피아노|기타|바이올린|어쿠스틱':     'acoustic, instrumental, classical, solo, gentle',
  '자유|여행|모험|길|인디':            'indie, folk, wanderlust, road trip, organic',
  '행복|웃음|기쁨|축제|설레':          'happy, festive, energetic, pop, bright',
  'verse|chorus|bridge|hook':          'structured, pop, vocal, mainstream, radio-friendly',
};

function localMatch(text) {
  const matched = new Set();
  Object.entries(LOCAL_MAP).forEach(([pat, styles]) => {
    if (new RegExp(pat, 'i').test(text)) {
      styles.split(', ').forEach(s => matched.add(s));
    }
  });
  return Array.from(matched).slice(0, 6);
}

export default withSentry(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { lyrics = '', mood = '', genre = '' } = req.body || {};
  const input = [lyrics.slice(0, 300), mood, genre].filter(Boolean).join(', ').trim();
  if (!input) return res.status(400).json({ error: 'input required' });

  /* ── 1차: Gemini 의미 분석 ── */
  if (KIE_API_KEY) {
    try {
      const messages = [
        {
          role: 'system',
          content: '음악 스타일 추천 전문가입니다. 입력된 가사/분위기를 분석하여 어울리는 영문 음악 스타일 태그 5개를 쉼표로 구분하여 반환하세요. 태그만 출력하고 설명은 하지 마세요. 예시: ballad, emotional, piano, soft, melancholic',
        },
        {
          role: 'user',
          content: `다음 내용에 어울리는 음악 스타일 태그 5개를 추천해주세요:\n"${input.slice(0, 400)}"`,
        },
      ];

      const r = await fetch(`${KIE_BASE}/gemini-2.5-flash/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${KIE_API_KEY}`,
        },
        body: JSON.stringify({ messages, stream: false }),
        signal: AbortSignal.timeout(6000),
      });

      if (r.ok) {
        const data = await r.json();
        const content = data?.choices?.[0]?.message?.content || '';
        /* 영문 소문자/숫자/하이픈/공백만 허용 — 모델 출력 검증 */
        const geminiStyles = content
          .split(',')
          .map(s => s.trim().replace(/[^a-z0-9\s\-]/gi, ''))
          .filter(s => s && s.length >= 2 && s.length <= 30)
          .slice(0, 6);

        if (geminiStyles.length >= 3) {
          return res.status(200).json({ styles: geminiStyles, source: 'gemini' });
        }
      }
    } catch (e) {
      console.warn('[ai-recommend] Gemini 실패:', e.message);
    }
  }

  /* ── 2차: 로컬 키워드 매칭 폴백 ── */
  const localStyles = localMatch(input);
  return res.status(200).json({ styles: localStyles, source: 'local' });
});
