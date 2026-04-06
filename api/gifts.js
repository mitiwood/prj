/**
 * /api/gifts — 선물하기 API
 * POST: 선물 보내기
 * GET ?to=name&provider=p: 받은 선물 목록
 * GET ?from=name&provider=p: 보낸 선물 목록
 * PATCH: 선물 열기 (id, action=open)
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const BASE = process.env.SITE_URL || 'https://ddinggok.com';

async function sb(method, path, body) {
  if (!SB_URL || !SB_KEY) return null;
  const opts = {
    method,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'GET' ? '' : 'return=representation',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1${path}`, opts);
  const txt = await r.text();
  if (!r.ok) return null;
  return txt ? JSON.parse(txt) : [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SB_URL || !SB_KEY) {
    return res.status(200).json({ ok: false, error: 'DB not configured' });
  }

  /* ── GET: 선물 목록 조회 ── */
  if (req.method === 'GET') {
    const { to, from, provider } = req.query;
    let path = '/gifts?select=id,from_name,to_name,track_title,track_image,track_audio_url,track_tags,message,emoji,opened,created_at&order=created_at.desc&limit=50';
    if (to) path += `&to_name=eq.${encodeURIComponent(to)}`;
    if (from) path += `&from_name=eq.${encodeURIComponent(from)}`;
    if (provider && to) path += `&to_provider=eq.${encodeURIComponent(provider)}`;
    if (provider && from) path += `&from_provider=eq.${encodeURIComponent(provider)}`;
    const rows = await sb('GET', path);
    return res.status(200).json({ ok: true, gifts: rows || [] });
  }

  /* ── POST: 선물 보내기 ── */
  if (req.method === 'POST') {
    const b = req.body || {};
    const { from_name, from_provider, to_name, track_id, track_title, track_image, track_audio_url, track_tags, message, emoji } = b;
    if (!from_name || !to_name || !track_audio_url) {
      return res.status(400).json({ ok: false, error: 'from_name, to_name, track_audio_url required' });
    }

    /* 받는 사람 존재 여부 확인 */
    const userCheck = await sb('GET', `/users?name=ilike.${encodeURIComponent(to_name)}&select=name&limit=1`);
    if (!userCheck || !userCheck.length) {
      return res.status(400).json({ ok: false, error: '\uC874\uC7AC\uD558\uC9C0 \uC54A\uB294 \uC0AC\uC6A9\uC790\uC785\uB2C8\uB2E4' });
    }

    const row = {
      from_name: from_name || '',
      from_provider: from_provider || '',
      to_name: to_name || '',
      track_id: track_id || '',
      track_title: (track_title || '').slice(0, 100),
      track_image: track_image || '',
      track_audio_url: track_audio_url || '',
      track_tags: (track_tags || '').slice(0, 300),
      message: (message || '').slice(0, 200),
      emoji: (emoji || '\uD83C\uDFB5').slice(0, 4),
      opened: false,
      created_at: new Date().toISOString(),
    };

    const result = await sb('POST', '/gifts', row);
    if (!result) return res.status(500).json({ ok: false, error: 'DB insert failed' });

    /* 알림 전송 (fire-and-forget) */
    const notifyText = `\uD83C\uDF81 \uC120\uBB3C \uB3C4\uCC29!\n\n${emoji || '\uD83C\uDFB5'} ${from_name}\uB2D8\uC774 ${to_name}\uB2D8\uC5D0\uAC8C\n\uD83C\uDFB6 "${track_title || '\uBB34\uC81C'}"\uB97C \uC120\uBB3C\uD588\uC5B4\uC694\n\uD83D\uDCAC ${message || ''}`;
    try {
      await fetch(`${BASE}/api/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: notifyText, parse_mode: '' }),
      });
    } catch {}
    try {
      await fetch(`${BASE}/api/slack-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: notifyText }),
      });
    } catch {}

    return res.status(200).json({ ok: true, gift: result[0] || result });
  }

  /* ── PATCH: 선물 열기 ── */
  if (req.method === 'PATCH') {
    const b = req.body || {};
    const { id } = b;
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });

    const result = await sb('PATCH', `/gifts?id=eq.${encodeURIComponent(id)}`, { opened: true });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
