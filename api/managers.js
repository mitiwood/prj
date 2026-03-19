/**
 * /api/managers — 매니저 계정 관리 API
 * GET    → 매니저 목록 조회 (관리자 인증)
 * POST   → 매니저 추가/수정 (관리자 인증)
 * DELETE → 매니저 삭제 (관리자 인증)
 * PATCH  → 매니저 로그인 검증 (인증 불필요)
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'kenny2024!';

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
  return { data, status: r.status, ok: r.ok };
}

function isAdmin(req) {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  return auth === ADMIN_SECRET;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — 매니저 목록 (관리자 전용)
  if (req.method === 'GET') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const { data } = await sb('/managers?order=created_at.desc&limit=100');
      const managers = (Array.isArray(data) ? data : []).map(m => ({
        id: m.id, name: m.name, mgr_id: m.mgr_id, email: m.email || '',
        role: m.role, memo: m.memo || '', active: m.active,
        lastAccess: m.last_access || 0, createdAt: m.created_at,
      }));
      return res.status(200).json({ managers, total: managers.length, source: 'supabase' });
    } catch (e) {
      return res.status(200).json({ managers: [], total: 0, source: 'memory', error: e.message });
    }
  }

  // POST — 매니저 추가/수정 (관리자 전용)
  if (req.method === 'POST') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    let body = req.body || {};
    if (typeof body === 'string') try { body = JSON.parse(body); } catch { body = {}; }
    const { name, mgr_id, pw_hash, email, role, memo, edit_id } = body;
    if (!name || !mgr_id) return res.status(400).json({ error: 'name, mgr_id required' });

    try {
      if (edit_id) {
        // 수정
        const update = { name, email: email || '', role: role || 'manager', memo: memo || '' };
        if (pw_hash) update.pw_hash = pw_hash;
        await sb(`/managers?id=eq.${edit_id}`, {
          method: 'PATCH', prefer: 'return=minimal',
          body: JSON.stringify(update),
        });
        return res.status(200).json({ success: true, action: 'updated' });
      } else {
        // 추가 — 중복 체크
        const { data: existing } = await sb(`/managers?mgr_id=eq.${encodeURIComponent(mgr_id)}&limit=1`);
        if (Array.isArray(existing) && existing.length > 0) {
          return res.status(400).json({ error: '이미 존재하는 아이디입니다' });
        }
        if (!pw_hash) return res.status(400).json({ error: 'pw_hash required' });
        await sb('/managers', {
          method: 'POST', prefer: 'return=minimal',
          body: JSON.stringify({
            name, mgr_id, pw_hash, email: email || '',
            role: role || 'manager', memo: memo || '',
            active: true, last_access: 0,
          }),
        });
        return res.status(200).json({ success: true, action: 'created' });
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // PATCH — 매니저 로그인 검증 (인증 불필요) / 활성화 토글 (관리자 전용)
  if (req.method === 'PATCH') {
    let body = req.body || {};
    if (typeof body === 'string') try { body = JSON.parse(body); } catch { body = {}; }

    // 로그인 검증
    if (body.action === 'login') {
      const { mgr_id, pw_hash } = body;
      if (!mgr_id || !pw_hash) return res.status(400).json({ error: 'mgr_id, pw_hash required' });
      try {
        const { data } = await sb(`/managers?mgr_id=eq.${encodeURIComponent(mgr_id)}&active=eq.true&limit=1`);
        const mgr = Array.isArray(data) ? data[0] : null;
        if (!mgr || mgr.pw_hash !== pw_hash) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }
        // 마지막 접속 시간 업데이트
        await sb(`/managers?id=eq.${mgr.id}`, {
          method: 'PATCH', prefer: 'return=minimal',
          body: JSON.stringify({ last_access: Date.now() }),
        });
        return res.status(200).json({
          success: true,
          manager: { name: mgr.name, id: mgr.mgr_id, role: mgr.role, email: mgr.email },
        });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // 활성화/비활성화 토글 (관리자 전용)
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { id, active } = body;
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      await sb(`/managers?id=eq.${id}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ active: !!active }),
      });
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // DELETE — 매니저 삭제 (관리자 전용)
  if (req.method === 'DELETE') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.query || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      await sb(`/managers?id=eq.${id}`, { method: 'DELETE' });
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
