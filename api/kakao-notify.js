/**
 * /api/kakao-notify — 카카오톡 나에게 보내기 알림 API
 *
 * POST body: { text, event?, data? }  → 카카오톡 나에게 보내기
 * GET  ?action=test                   → 테스트 메시지 발송
 *
 * 다른 API에서 호출: fetch('/api/kakao-notify', { method:'POST', body: { text } })
 * 토큰 만료 시 자동 갱신 (refresh_token 사용)
 */

const APP_URL = 'https://ai-music-studio-bice.vercel.app';
const KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID || '';
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET || '';
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'kenny2024!';

/* ── Supabase 헬퍼 ── */
async function sbGet(path) {
  const r = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Accept: 'application/json' },
  });
  const txt = await r.text();
  return txt ? JSON.parse(txt) : [];
}

async function sbUpsert(table, data) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
}

/* ── 토큰 가져오기 (만료 시 자동 갱신) ── */
async function getAccessToken() {
  const rows = await sbGet('/settings?key=eq.kakao_talk_token&select=value');
  if (!rows.length) throw new Error('카카오 토큰 없음. /api/kakao-talk?action=auth 로 먼저 인증하세요.');

  const data = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
  const now = Date.now();

  /* access_token이 아직 유효하면 그대로 사용 */
  if (now < data.expires_at - 60000) {
    return data.access_token;
  }

  /* refresh_token으로 갱신 */
  if (now > data.refresh_expires_at) {
    throw new Error('refresh_token 만료. /api/kakao-talk?action=auth 로 재인증 필요.');
  }

  const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: KAKAO_CLIENT_ID,
      client_secret: KAKAO_CLIENT_SECRET || '',
      refresh_token: data.refresh_token,
    }),
  });
  const token = await tokenRes.json();
  if (!token.access_token) throw new Error('토큰 갱신 실패: ' + (token.error_description || JSON.stringify(token)));

  /* 갱신된 토큰 저장 */
  const updated = {
    access_token: token.access_token,
    refresh_token: token.refresh_token || data.refresh_token,
    expires_at: now + (token.expires_in || 21600) * 1000,
    refresh_expires_at: token.refresh_token
      ? now + (token.refresh_token_expires_in || 5184000) * 1000
      : data.refresh_expires_at,
    updated_at: new Date().toISOString(),
  };
  await sbUpsert('settings', { key: 'kakao_talk_token', value: JSON.stringify(updated) });

  return token.access_token;
}

/* ── 카카오톡 나에게 보내기 ── */
async function kakaoSend(text) {
  const accessToken = await getAccessToken();

  const templateObject = JSON.stringify({
    object_type: 'text',
    text: text.slice(0, 300),
    link: {
      web_url: APP_URL,
      mobile_web_url: APP_URL,
    },
    button_title: '사이트 열기',
  });

  const r = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ template_object: templateObject }),
  });

  const result = await r.json();
  if (r.ok && result.result_code === 0) {
    return { ok: true };
  }
  throw new Error(`카카오 발송 실패: ${result.msg || JSON.stringify(result)}`);
}

/* ── 이벤트 → 메시지 변환 ── */
function formatEvent(event, data = {}) {
  const ts = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const modeLabel = { custom: '커스텀', simple: '심플', youtube: 'YouTube', mv: 'MV', vocal: '보컬변환' };

  switch (event) {
    case 'music_created':
      return `🎵 새 곡 생성\n${data.title || '무제'} (${modeLabel[data.mode] || data.mode || '?'})\n생성자: ${data.user || '익명'}\n${ts}`;
    case 'mv_created':
      return `🎬 MV 완성\n${data.title || '무제'}\n${ts}`;
    case 'new_user':
      return `👤 새 사용자\n${data.name || '?'} (${data.provider || '?'})\n${ts}`;
    case 'comment':
      return `💬 새 댓글\n${data.author || '익명'}: ${(data.text || '').slice(0, 80)}\n${ts}`;
    case 'track_deleted':
      return `🗑 트랙 삭제\n${data.title || data.id || '?'}\n${ts}`;
    case 'payment':
      return `💰 결제 완료\n${data.user || '?'} · ${data.amount || '?'}원\n${ts}`;
    case 'error':
      return `🚨 시스템 오류\n${data.message || '알 수 없는 오류'}\n${ts}`;
    default:
      return `📌 ${event}\n${JSON.stringify(data).slice(0, 200)}\n${ts}`;
  }
}

/* ── 핸들러 ── */
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* GET — 테스트 / 상태 (인증 불필요) */
  if (req.method === 'GET') {
    if (req.query?.action === 'test') {
      try {
        const ts = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
        await kakaoSend(`✅ Kenny Music Studio 알림 테스트\n\n정상 작동 중!\n${ts}`);
        return res.status(200).json({ ok: true, message: '테스트 메시지 발송 완료' });
      } catch (e) {
        return res.status(200).json({ ok: false, error: e.message });
      }
    }
    return res.status(200).json({ usage: 'POST { text } 또는 GET ?action=test' });
  }

  /* POST — 알림 발송 */
  if (req.method === 'POST') {
    const { text, event, data } = req.body || {};

    let msg = text || '';
    if (event) msg = formatEvent(event, data);
    if (!msg) return res.status(400).json({ error: 'text 또는 event 필요' });

    try {
      await kakaoSend(msg);
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.warn('[kakao-notify] 발송 실패:', e.message);
      return res.status(200).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

/* 외부에서 import해서 사용할 수 있도록 export */
export { kakaoSend, formatEvent };
