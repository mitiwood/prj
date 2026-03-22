/**
 * /api/challenges — 챌린지/이벤트 API
 *
 * GET              → 활성 챌린지 목록 (public)
 * POST   body      → 챌린지 생성 (admin)
 * PATCH  body      → 활성/비활성 (admin)
 * DELETE ?id=      → 삭제 (admin)
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PWD = process.env.ADMIN_SECRET;

let _mem = [];

async function sb(method, path, body = null) {
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: method === 'GET' ? 'count=exact' : 'return=representation',
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1${path}`, opts);
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { return txt; }
}

function isAdmin(req) {
  return (req.headers?.authorization || '') === `Bearer ${ADMIN_PWD}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* GET — 활성 챌린지 조회 */
  if (req.method === 'GET') {
    if (SB_URL && SB_KEY) {
      try {
        const data = await sb('GET', '/challenges?active=eq.true&order=created_at.desc&limit=10');
        return res.status(200).json({ ok: true, challenges: Array.isArray(data) ? data : [] });
      } catch (e) {
        return res.status(200).json({ ok: true, challenges: _mem.filter(c => c.active) });
      }
    }
    return res.status(200).json({ ok: true, challenges: _mem.filter(c => c.active) });
  }

  /* POST — 챌린지 생성 (admin) */
  if (req.method === 'POST') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { title, description = '', icon = '🔥', theme = '', end_at, reward = '' } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const ch = { title, description, icon, theme, reward, active: true, start_at: new Date().toISOString(), end_at: end_at || null, created_at: new Date().toISOString() };
    if (SB_URL && SB_KEY) {
      try {
        const data = await sb('POST', '/challenges', ch);
        return res.status(200).json({ ok: true, challenge: Array.isArray(data) ? data[0] : data });
      } catch (e) {
        ch.id = Date.now();
        _mem.push(ch);
        return res.status(200).json({ ok: true, challenge: ch, source: 'memory' });
      }
    }
    ch.id = Date.now();
    _mem.push(ch);
    return res.status(200).json({ ok: true, challenge: ch, source: 'memory' });
  }

  /* PATCH — 활성/비활성 (admin) */
  if (req.method === 'PATCH') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { id, active } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    if (SB_URL && SB_KEY) {
      try {
        await sb('PATCH', `/challenges?id=eq.${id}`, { active: !!active });
        return res.status(200).json({ ok: true });
      } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
    }
    const c = _mem.find(x => x.id == id);
    if (c) c.active = !!active;
    return res.status(200).json({ ok: true });
  }

  /* DELETE — 삭제 (admin) */
  if (req.method === 'DELETE') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    if (SB_URL && SB_KEY) {
      try {
        await sb('DELETE', `/challenges?id=eq.${id}`);
        return res.status(200).json({ ok: true });
      } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
    }
    _mem = _mem.filter(x => x.id != id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
