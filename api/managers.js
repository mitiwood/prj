/**
 * /api/managers — 매니저 계정 관리 API
 * Supabase managers 테이블 우선, 없으면 인메모리 폴백
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'kenny2024!';

let _mem = []; // 인메모리 폴백
let _useSb = null; // null=미확인, true/false

async function sb(path, opts = {}) {
  if (!SB_URL || !SB_KEY) throw new Error('no_supabase');
  const r = await fetch(`${SB_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json; charset=utf-8',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!r.ok) throw new Error(`SB ${r.status}: ${text.slice(0, 200)}`);
  return data;
}

async function checkTable() {
  if (_useSb !== null) return _useSb;
  try {
    await sb('/managers?limit=1');
    _useSb = true;
  } catch {
    _useSb = false;
  }
  return _useSb;
}

function isAdmin(req) {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  return auth === ADMIN_SECRET;
}

function memToResponse(m, idx) {
  return { id: m._id || idx, name: m.name, mgr_id: m.mgr_id, email: m.email || '',
    role: m.role || 'manager', memo: m.memo || '', active: m.active !== false,
    lastAccess: m.last_access || 0, createdAt: m.created_at || new Date().toISOString() };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const hasSb = await checkTable();

  // GET — 매니저 목록
  if (req.method === 'GET') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    if (hasSb) {
      try {
        const data = await sb('/managers?order=created_at.desc&limit=100');
        const managers = (Array.isArray(data) ? data : []).map(m => ({
          id: m.id, name: m.name, mgr_id: m.mgr_id, email: m.email || '',
          role: m.role, memo: m.memo || '', active: m.active,
          lastAccess: m.last_access || 0, createdAt: m.created_at,
        }));
        return res.status(200).json({ managers, total: managers.length, source: 'supabase' });
      } catch (e) {
        return res.status(200).json({ managers: _mem.map(memToResponse), total: _mem.length, source: 'memory', error: e.message });
      }
    }
    return res.status(200).json({ managers: _mem.map(memToResponse), total: _mem.length, source: 'memory' });
  }

  // POST — 매니저 추가/수정
  if (req.method === 'POST') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    let body = req.body || {};
    if (typeof body === 'string') try { body = JSON.parse(body); } catch { body = {}; }
    const { name, mgr_id, pw_hash, email, role, memo, edit_id } = body;
    if (!name || !mgr_id) return res.status(400).json({ error: 'name, mgr_id required' });

    if (hasSb) {
      try {
        if (edit_id) {
          const update = { name, email: email || '', role: role || 'manager', memo: memo || '' };
          if (pw_hash) update.pw_hash = pw_hash;
          await sb(`/managers?id=eq.${edit_id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(update) });
          return res.status(200).json({ success: true, action: 'updated' });
        }
        const existing = await sb(`/managers?mgr_id=eq.${encodeURIComponent(mgr_id)}&limit=1`);
        if (Array.isArray(existing) && existing.length > 0) {
          return res.status(400).json({ error: '이미 존재하는 아이디입니다' });
        }
        if (!pw_hash) return res.status(400).json({ error: 'pw_hash required' });
        await sb('/managers', { method: 'POST', prefer: 'return=minimal',
          body: JSON.stringify({ name, mgr_id, pw_hash, email: email || '', role: role || 'manager', memo: memo || '', active: true, last_access: 0 }) });
        return res.status(200).json({ success: true, action: 'created' });
      } catch (e) {
        // Supabase 실패 → 인메모리 폴백
        console.warn('[managers POST] SB fail, fallback:', e.message);
      }
    }
    // 인메모리
    if (edit_id) {
      const idx = _mem.findIndex(m => m._id == edit_id);
      if (idx >= 0) { Object.assign(_mem[idx], { name, email, role, memo }); if (pw_hash) _mem[idx].pw_hash = pw_hash; }
      return res.status(200).json({ success: true, action: 'updated', source: 'memory' });
    }
    if (_mem.find(m => m.mgr_id === mgr_id)) return res.status(400).json({ error: '이미 존재하는 아이디입니다' });
    if (!pw_hash) return res.status(400).json({ error: 'pw_hash required' });
    const newId = Date.now();
    _mem.push({ _id: newId, name, mgr_id, pw_hash, email: email || '', role: role || 'manager', memo: memo || '', active: true, last_access: 0, created_at: new Date().toISOString() });
    return res.status(200).json({ success: true, action: 'created', source: 'memory', id: newId });
  }

  // PATCH — 로그인 검증 / 활성화 토글
  if (req.method === 'PATCH') {
    let body = req.body || {};
    if (typeof body === 'string') try { body = JSON.parse(body); } catch { body = {}; }

    if (body.action === 'login') {
      const { mgr_id, pw_hash } = body;
      if (!mgr_id || !pw_hash) return res.status(400).json({ error: 'mgr_id, pw_hash required' });
      let mgr = null;
      if (hasSb) {
        try {
          const data = await sb(`/managers?mgr_id=eq.${encodeURIComponent(mgr_id)}&active=eq.true&limit=1`);
          mgr = Array.isArray(data) ? data[0] : null;
        } catch {}
      }
      if (!mgr) mgr = _mem.find(m => m.mgr_id === mgr_id && m.active !== false);
      if (!mgr || mgr.pw_hash !== pw_hash) return res.status(401).json({ error: 'Invalid credentials' });
      // 접속 시간 업데이트
      if (hasSb && mgr.id) { try { await sb(`/managers?id=eq.${mgr.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ last_access: Date.now() }) }); } catch {} }
      return res.status(200).json({ success: true, manager: { name: mgr.name, id: mgr.mgr_id, role: mgr.role, email: mgr.email } });
    }

    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { id, active } = body;
    if (!id) return res.status(400).json({ error: 'id required' });
    if (hasSb) { try { await sb(`/managers?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ active: !!active }) }); } catch {} }
    const idx = _mem.findIndex(m => m._id == id);
    if (idx >= 0) _mem[idx].active = !!active;
    return res.status(200).json({ success: true });
  }

  // DELETE
  if (req.method === 'DELETE') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.query || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    if (hasSb) { try { await sb(`/managers?id=eq.${id}`, { method: 'DELETE' }); } catch {} }
    _mem = _mem.filter(m => m._id != id);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
