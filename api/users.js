/**
 * /api/users — 로그인 사용자 저장/조회
 * GET:  관리자 조회 (ADMIN_SECRET 인증)
 * POST: 로그인 이벤트 저장 (클라이언트에서 호출)
 *
 * Supabase 연동 우선, 실패 시 in-memory fallback
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'kenny2024!';

/* in-memory fallback (Supabase 미연동 시) */
let _memStore = [];

async function sbFetch(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase not configured');
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json; charset=utf-8',
      'Accept':        'application/json; charset=utf-8',
      'Prefer':        options.prefer || '',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* ── GET: 관리자 조회 ── */
  if (req.method === 'GET') {
    const auth = req.headers.authorization || '';
    if (!auth || auth !== `Bearer ${ADMIN_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const users = await sbFetch('/users?order=last_login.desc&limit=200');
      return res.status(200).json({ users, total: users.length, source: 'supabase' });
    } catch (e) {
      console.warn('[users GET] Supabase 실패, fallback:', e.message);
      const sorted = [..._memStore].sort((a,b) => (b.lastLogin||0) - (a.lastLogin||0));
      return res.status(200).json({ users: sorted, total: sorted.length, source: 'memory', note: e.message });
    }
  }

  /* ── POST: 로그인 저장 ── */
  if (req.method === 'POST') {
    try {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      body = body || {};

      const { name, provider, email, avatar, id, ua, isMobile, lastLogin, loginCount } = body;
      if (!name || !provider) return res.status(400).json({ error: 'name and provider required' });

      const entry = {
        name, provider,
        email:       email    || '',
        avatar:      avatar   || '',
        uid:         id       || '',
        ua:          (ua||'').slice(0, 250),
        is_mobile:   !!isMobile,
        last_login:  typeof lastLogin === 'number' ? lastLogin : Date.now(),
        login_count: typeof loginCount === 'number' ? loginCount : 1,
      };

      try {
        /* upsert: name+provider 중복 시 업데이트 */
        await sbFetch('/users?on_conflict=name,provider', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates',
          body: JSON.stringify(entry),
        });
        return res.status(200).json({ success: true, source: 'supabase' });
      } catch (e) {
        console.warn('[users POST] Supabase 실패, memory fallback:', e.message);
        /* in-memory fallback */
        const idx = _memStore.findIndex(u => u.name === name && u.provider === provider);
        const memEntry = { ...entry, lastLogin: entry.last_login, loginCount: entry.login_count };
        if (idx >= 0) _memStore[idx] = { ..._memStore[idx], ...memEntry };
        else { _memStore.unshift(memEntry); if (_memStore.length > 200) _memStore = _memStore.slice(0, 200); }
        return res.status(200).json({ success: true, source: 'memory', note: e.message });
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
