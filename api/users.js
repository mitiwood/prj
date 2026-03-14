/**
 * /api/users — 로그인 사용자 저장/조회
 * GET:  관리자 조회 (ADMIN_SECRET 인증)
 * POST: 로그인 이벤트 저장 (클라이언트에서 호출)
 *
 * ⚠️ Vercel serverless 특성상 in-memory 저장소는 콜드스타트마다 초기화됨
 *    → GET 응답에 항상 { users, note } 포함해 admin이 판단하도록 처리
 *    → 실 운영에서는 Vercel KV / Supabase 권장
 */

/* 워크어라운드: 모듈 레벨 Map (같은 warm 인스턴스 내에서만 유지) */
let _userStore = [];
let _lastReset = Date.now();
const MAX_USERS = 200;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* ── GET: 관리자 조회 ── */
  if (req.method === 'GET') {
    const auth = req.headers.authorization || '';
    const adminSecret = process.env.ADMIN_SECRET || 'kenny2024!';
    if (!auth || auth !== `Bearer ${adminSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(200).json({
      users: _userStore,
      total: _userStore.length,
      serverUptime: Date.now() - _lastReset,
      note: _userStore.length === 0
        ? 'cold_start: 서버 재시작으로 인해 메모리 초기화됨. localStorage 캐시를 사용하세요.'
        : 'ok'
    });
  }

  /* ── POST: 로그인 사용자 저장 ── */
  if (req.method === 'POST') {
    try {
      let body = req.body;
      /* body가 string인 경우 파싱 */
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      body = body || {};

      const { name, provider, email, avatar, id, ua, isMobile, lastLogin, loginCount } = body;
      if (!name || !provider) {
        return res.status(400).json({ error: 'name and provider required' });
      }

      const entry = {
        name, provider,
        email:    email    || '',
        avatar:   avatar   || '',
        id:       id       || '',
        ua:       (ua||'').slice(0, 200),
        isMobile: !!isMobile,
        lastLogin: typeof lastLogin === 'number' ? lastLogin : Date.now(),
        loginCount: typeof loginCount === 'number' ? loginCount : 1,
        serverSaved: Date.now(),
      };

      const idx = _userStore.findIndex(u => u.name === name && u.provider === provider);
      if (idx >= 0) {
        _userStore[idx] = {
          ..._userStore[idx], ...entry,
          loginCount: Math.max(_userStore[idx].loginCount || 1, entry.loginCount),
        };
      } else {
        _userStore.unshift(entry);
        if (_userStore.length > MAX_USERS) _userStore = _userStore.slice(0, MAX_USERS);
      }

      return res.status(200).json({ success: true, total: _userStore.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
