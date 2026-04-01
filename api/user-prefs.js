/**
 * /api/user-prefs — 사용자 음악 취향 설정 CRUD
 *
 * GET  ?name=xxx&provider=yyy → 취향 조회
 * POST { name, provider, genres, moods, push_time, daily_push_on } → 저장/업데이트
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sb(method, path, body) {
  if (!SB_URL || !SB_KEY) return null;
  const opts = {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: method === 'GET' ? '' : 'return=representation' },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1${path}`, opts);
  const txt = await r.text();
  if (!r.ok) return null;
  return txt ? JSON.parse(txt) : [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* GET: 취향 조회 */
  if (req.method === 'GET') {
    const name = req.query?.name || '';
    const provider = req.query?.provider || '';
    if (!name || !provider) return res.status(400).json({ error: 'name, provider required' });

    try {
      const rows = await sb('GET', `/user_prefs?user_name=eq.${encodeURIComponent(name)}&user_provider=eq.${encodeURIComponent(provider)}&limit=1`);
      const prefs = rows?.[0] || null;
      return res.status(200).json({ ok: true, prefs });
    } catch (e) {
      return res.status(200).json({ ok: true, prefs: null, error: e.message });
    }
  }

  /* POST: 취향 저장 */
  if (req.method === 'POST') {
    const { name, provider, genres, moods, push_time, daily_push_on } = req.body || {};
    if (!name || !provider) return res.status(400).json({ error: 'name, provider required' });

    const data = {
      user_name: name,
      user_provider: provider,
      genres: Array.isArray(genres) ? genres : [],
      moods: Array.isArray(moods) ? moods : [],
      push_time: push_time || '09:00',
      daily_push_on: !!daily_push_on,
      updated_at: new Date().toISOString(),
    };

    try {
      /* upsert */
      const existing = await sb('GET', `/user_prefs?user_name=eq.${encodeURIComponent(name)}&user_provider=eq.${encodeURIComponent(provider)}&limit=1`);
      if (existing?.[0]) {
        await sb('PATCH', `/user_prefs?user_name=eq.${encodeURIComponent(name)}&user_provider=eq.${encodeURIComponent(provider)}`, data);
      } else {
        await sb('POST', '/user_prefs', data);
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
