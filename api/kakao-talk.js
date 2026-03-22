/**
 * /api/kakao-talk — 카카오톡 나에게 보내기 OAuth 인증
 *
 * GET  ?action=auth     → 카카오 인증 페이지로 리디렉트 (talk_message 스코프)
 * GET  ?code=xxx        → 콜백: 토큰 교환 → Supabase 저장
 * GET  ?action=status   → 토큰 상태 확인
 * GET  ?action=refresh  → 수동 토큰 갱신
 *
 * 환경변수: KAKAO_CLIENT_ID, KAKAO_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

const APP_URL = 'https://ai-music-studio-bice.vercel.app';
const KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID || '';
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET || '';
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const REDIRECT_URI = `${APP_URL}/api/kakao-talk`;

function checkAuth(req) {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  return auth === ADMIN_SECRET;
}

async function sbGet(path) {
  const r = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      Accept: 'application/json',
    },
  });
  const txt = await r.text();
  return txt ? JSON.parse(txt) : [];
}

async function sbUpsert(table, data) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(data),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : [];
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const { action, code, error, error_description } = req.query || {};

  /* 0) 카카오 에러 콜백 처리 */
  if (error) {
    return res.status(400).json({
      error: '카카오 인증 실패',
      kakao_error: error,
      description: error_description || '알 수 없는 오류',
      help: '카카오 개발자 → 카카오 로그인 → Redirect URI에 정확히 등록되어 있는지 확인하세요.',
    });
  }

  /* 1) 카카오 인증 시작 */
  if (action === 'auth') {
    if (!KAKAO_CLIENT_ID) return res.status(500).json({ error: 'KAKAO_CLIENT_ID 미설정' });
    const params = new URLSearchParams({
      client_id: KAKAO_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'profile_nickname,talk_message',
    });
    return res.redirect(`https://kauth.kakao.com/oauth/authorize?${params}`);
  }

  /* 2) OAuth 콜백 — 코드 → 토큰 교환 → Supabase 저장 */
  if (code) {
    try {
      const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: KAKAO_CLIENT_ID,
          client_secret: KAKAO_CLIENT_SECRET || '',
          redirect_uri: REDIRECT_URI,
          code,
        }),
      });
      const token = await tokenRes.json();

      if (!token.access_token) {
        return res.status(400).json({ error: '토큰 발급 실패', detail: token });
      }

      /* Supabase settings 테이블에 저장 */
      await sbUpsert('settings', {
        key: 'kakao_talk_token',
        value: JSON.stringify({
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          expires_at: Date.now() + (token.expires_in || 21600) * 1000,
          refresh_expires_at: Date.now() + (token.refresh_token_expires_in || 5184000) * 1000,
          updated_at: new Date().toISOString(),
        }),
      });

      return res.status(200).json({
        ok: true,
        message: '카카오톡 알림 토큰 저장 완료!',
        expires_in: token.expires_in,
        refresh_expires_in: token.refresh_token_expires_in,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  /* 3) 토큰 상태 확인 */
  if (action === 'status') {
    if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const rows = await sbGet('/settings?key=eq.kakao_talk_token&select=value');
      if (!rows.length) return res.status(200).json({ ok: false, message: '토큰 없음. /api/kakao-talk?action=auth 로 인증하세요.' });
      const data = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      const now = Date.now();
      return res.status(200).json({
        ok: true,
        has_access_token: !!data.access_token,
        access_expired: now > data.expires_at,
        refresh_expired: now > data.refresh_expires_at,
        updated_at: data.updated_at,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  /* 4) 수동 토큰 갱신 */
  if (action === 'refresh') {
    if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const rows = await sbGet('/settings?key=eq.kakao_talk_token&select=value');
      if (!rows.length) return res.status(400).json({ error: '저장된 토큰 없음' });
      const data = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;

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

      if (!token.access_token) {
        return res.status(400).json({ error: '토큰 갱신 실패', detail: token });
      }

      await sbUpsert('settings', {
        key: 'kakao_talk_token',
        value: JSON.stringify({
          access_token: token.access_token,
          refresh_token: token.refresh_token || data.refresh_token,
          expires_at: Date.now() + (token.expires_in || 21600) * 1000,
          refresh_expires_at: token.refresh_token
            ? Date.now() + (token.refresh_token_expires_in || 5184000) * 1000
            : data.refresh_expires_at,
          updated_at: new Date().toISOString(),
        }),
      });

      return res.status(200).json({ ok: true, message: '토큰 갱신 완료' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  /* 기본: 사용법 안내 */
  return res.status(200).json({
    usage: {
      auth: `${APP_URL}/api/kakao-talk?action=auth — 카카오 인증 시작`,
      status: `${APP_URL}/api/kakao-talk?action=status — 토큰 상태 확인`,
      refresh: `${APP_URL}/api/kakao-talk?action=refresh — 토큰 수동 갱신`,
    },
  });
}
