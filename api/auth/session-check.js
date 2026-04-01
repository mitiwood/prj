/**
 * /api/auth/session-check — 세션 유효성 검증
 * GET ?name=xxx&provider=yyy&sid=zzz → 현재 세션이 유효한지 확인
 *
 * 다른 디바이스에서 로그인하면 session_id가 바뀌므로
 * 이전 디바이스의 세션은 무효가 됨 → 자동 로그아웃
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const name = req.query?.name || '';
  const provider = req.query?.provider || '';
  const sid = req.query?.sid || '';

  if (!name || !provider || !sid) {
    return res.status(400).json({ ok: false, error: 'name, provider, sid required' });
  }

  if (!SB_URL || !SB_KEY) {
    return res.status(200).json({ ok: true, valid: true }); /* DB 없으면 항상 유효 */
  }

  try {
    const r = await fetch(`${SB_URL}/rest/v1/users?name=ilike.${encodeURIComponent(name)}&provider=eq.${encodeURIComponent(provider)}&select=session_id,session_device,session_ip,session_at&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    const rows = await r.json();
    const user = Array.isArray(rows) ? rows[0] : null;

    if (!user || !user.session_id) {
      return res.status(200).json({ ok: true, valid: true }); /* 세션 정보 없으면 통과 */
    }

    if (user.session_id === sid) {
      return res.status(200).json({ ok: true, valid: true });
    }

    /* 세션 불일치 → 다른 디바이스에서 로그인됨 */
    return res.status(200).json({
      ok: true,
      valid: false,
      reason: 'another_device',
      device: user.session_device || 'Unknown',
      loginAt: user.session_at || 0,
    });
  } catch (e) {
    return res.status(200).json({ ok: true, valid: true, error: e.message }); /* 에러 시 통과 */
  }
}
