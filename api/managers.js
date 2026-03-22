/**
 * /api/managers — 매니저 계정 관리 API
 * Supabase users 테이블 활용 (provider='mgr_*' 로 구분)
 * 별도 managers 테이블 불필요!
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

/* 인메모리 폴백 (Supabase 미연결 시) */
let _memManagers = [];
const _useMem = !SB_URL || !SB_KEY;

async function sb(path, opts = {}) {
  if (!SB_URL || !SB_KEY) throw new Error('no_supabase');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`${SB_URL}/rest/v1${path}`, {
      ...opts,
      signal: controller.signal,
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
  } finally {
    clearTimeout(timeout);
  }
}

function isAdmin(req) {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  return auth === ADMIN_SECRET;
}

/* users 테이블의 매니저 행을 매니저 객체로 변환 */
function userToMgr(u) {
  // provider = 'mgr_super', 'mgr_manager', 'mgr_viewer'
  const role = (u.provider || '').replace('mgr_', '') || 'manager';
  // ua 필드에 JSON으로 pw_hash, memo 저장
  let extra = {};
  try { extra = JSON.parse(u.ua || '{}'); } catch { extra = {}; }
  return {
    id: u.id,
    name: u.name,
    mgr_id: u.uid || '',
    email: u.email || '',
    role,
    memo: extra.memo || '',
    pw_hash: extra.pw_hash || '',
    active: !u.is_mobile, // is_mobile=false → active=true
    lastAccess: u.last_login || 0,
    createdAt: u.created_at,
  };
}

/* 매니저 객체를 users 행으로 변환 */
function mgrToUser(m) {
  return {
    name: m.name,
    provider: 'mgr_' + (m.role || 'manager'),
    email: m.email || '',
    uid: m.mgr_id,
    ua: JSON.stringify({ pw_hash: m.pw_hash, memo: m.memo || '' }),
    is_mobile: !m.active, // active=true → is_mobile=false
    last_login: m.lastAccess || 0,
    login_count: 1,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — 매니저 목록
  if (req.method === 'GET') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    if (_useMem) return res.status(200).json({ managers: _memManagers, total: _memManagers.length, source: 'memory' });
    try {
      const data = await sb('/users?provider=like.mgr_*&order=created_at.desc&limit=100');
      const managers = (Array.isArray(data) ? data : []).map(userToMgr);
      return res.status(200).json({ managers, total: managers.length, source: 'supabase' });
    } catch (e) {
      return res.status(200).json({ managers: _memManagers, total: _memManagers.length, source: 'fallback', error: e.message });
    }
  }

  // POST — 매니저 추가/수정
  if (req.method === 'POST') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    let body = req.body || {};
    if (typeof body === 'string') try { body = JSON.parse(body); } catch { body = {}; }
    const { name, mgr_id, pw_hash, email, role, memo, edit_id } = body;
    if (!name || !mgr_id) return res.status(400).json({ error: 'name, mgr_id required' });

    if (_useMem) {
      const idx = edit_id ? _memManagers.findIndex(m=>m.id===edit_id) : -1;
      if (edit_id && idx>=0) { Object.assign(_memManagers[idx], {name,mgr_id,email,role,memo}); if(pw_hash) _memManagers[idx].pw_hash=pw_hash; return res.status(200).json({success:true,action:'updated',source:'memory'}); }
      if (!edit_id && !pw_hash) return res.status(400).json({error:'pw_hash required'});
      if (_memManagers.find(m=>m.mgr_id===mgr_id)) return res.status(400).json({error:'이미 존재하는 아이디입니다'});
      _memManagers.unshift({id:'mem_'+Date.now(),name,mgr_id,pw_hash,email:email||'',role:role||'manager',memo:memo||'',active:true,lastAccess:0,createdAt:new Date().toISOString()});
      return res.status(200).json({success:true,action:'created',source:'memory'});
    }
    try {
      if (edit_id) {
        // 수정
        const update = {
          name,
          email: email || '',
          provider: 'mgr_' + (role || 'manager'),
        };
        const extra = { memo: memo || '' };
        if (pw_hash) extra.pw_hash = pw_hash;
        else {
          // 기존 pw_hash 유지
          const existing = await sb(`/users?id=eq.${edit_id}&limit=1`);
          if (Array.isArray(existing) && existing[0]) {
            try { const old = JSON.parse(existing[0].ua || '{}'); extra.pw_hash = old.pw_hash || ''; } catch {}
          }
        }
        update.ua = JSON.stringify(extra);
        await sb(`/users?id=eq.${edit_id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(update) });
        return res.status(200).json({ success: true, action: 'updated' });
      }

      // 추가 — 중복 체크
      const existing = await sb(`/users?uid=eq.${encodeURIComponent(mgr_id)}&provider=like.mgr_*&limit=1`);
      if (Array.isArray(existing) && existing.length > 0) {
        return res.status(400).json({ error: '이미 존재하는 아이디입니다' });
      }
      if (!pw_hash) return res.status(400).json({ error: 'pw_hash required' });

      const row = mgrToUser({ name, mgr_id, pw_hash, email, role, memo, active: true, lastAccess: 0 });
      await sb('/users', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(row) });
      return res.status(200).json({ success: true, action: 'created' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // PATCH — 로그인 검증 / 활성화 토글
  if (req.method === 'PATCH') {
    let body = req.body || {};
    if (typeof body === 'string') try { body = JSON.parse(body); } catch { body = {}; }

    if (body.action === 'login') {
      const { mgr_id, pw_hash } = body;
      if (!mgr_id || !pw_hash) return res.status(400).json({ error: 'mgr_id, pw_hash required' });
      if (_useMem) {
        const m = _memManagers.find(x=>x.mgr_id===mgr_id && x.active && x.pw_hash===pw_hash);
        if (!m) return res.status(401).json({ error: 'Invalid credentials' });
        m.lastAccess = Date.now();
        return res.status(200).json({ success:true, manager:{name:m.name,id:m.mgr_id,role:m.role,email:m.email} });
      }
      try {
        // uid로 매니저 조회 (active = is_mobile=false)
        const data = await sb(`/users?uid=eq.${encodeURIComponent(mgr_id)}&provider=like.mgr_*&is_mobile=eq.false&limit=1`);
        const row = Array.isArray(data) ? data[0] : null;
        if (!row) return res.status(401).json({ error: 'Invalid credentials' });
        const mgr = userToMgr(row);
        if (mgr.pw_hash !== pw_hash) return res.status(401).json({ error: 'Invalid credentials' });

        // 접속 시간 업데이트
        await sb(`/users?id=eq.${row.id}`, {
          method: 'PATCH', prefer: 'return=minimal',
          body: JSON.stringify({ last_login: Date.now() }),
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
    if (_useMem) {
      const m = _memManagers.find(x=>x.id===id); if(m) m.active=!!active;
      return res.status(200).json({ success:true, source:'memory' });
    }
    try {
      await sb(`/users?id=eq.${id}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ is_mobile: !active }), // active → is_mobile=false
      });
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // DELETE
  if (req.method === 'DELETE') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.query || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    if (_useMem) {
      _memManagers = _memManagers.filter(m=>m.id!==id);
      return res.status(200).json({ success:true, source:'memory' });
    }
    try {
      await sb(`/users?id=eq.${id}&provider=like.mgr_*`, { method: 'DELETE' });
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
