/**
 * /api/users — 로그인 사용자 저장/조회
 * GET:  관리자 조회 (ADMIN_SECRET 인증)
 * POST: 로그인 이벤트 저장 (클라이언트에서 호출)
 *
 * Supabase 연동 우선, 실패 시 in-memory fallback
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key
const ADMIN_SECRET = process.env.ADMIN_SECRET;

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT = (process.env.TELEGRAM_CHAT_ID || '').trim();

/* in-memory fallback (Supabase 미연동 시) */
let _memStore = [];

async function _kakaoNotify(event, data) {
  try {
    await fetch('https://ai-music-studio-bice.vercel.app/api/kakao-notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data }),
    });
  } catch {}
}

async function _tgNotify(event, data) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    const ts = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const icon = event === 'new_user' ? '🆕' : '👤';
    const label = event === 'new_user' ? '신규 가입' : '재방문 로그인';
    const device = data.isMobile ? '📱 모바일' : '💻 PC';
    let text = `${icon} ${label}\n`;
    text += `이름: ${data.name||'?'}\n`;
    text += `소셜: ${data.provider||'?'}\n`;
    if(data.email) text += `이메일: ${data.email}\n`;
    text += `디바이스: ${device}\n`;
    if(data.loginCount > 1) text += `방문횟수: ${data.loginCount}회\n`;
    text += `⏰ ${ts}`;
    const body = Buffer.from(JSON.stringify({ chat_id: TG_CHAT, text }), 'utf-8');
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(body.length) },
      body,
    });
  } catch(e) { console.warn('[TG]', e.message); }
}

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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

      const now = typeof lastLogin === 'number' ? lastLogin : Date.now();

      try {
        /* 기존 유저 조회 → login_count +1 누적 */
        let existingCount = 0;
        let isNew = true;
        try {
          const existing = await sbFetch(`/users?name=ilike.${encodeURIComponent(name)}&provider=eq.${encodeURIComponent(provider)}&select=login_count`);
          if (existing?.length > 0) {
            existingCount = existing[0].login_count || 0;
            isNew = false;
          }
        } catch {}

        const entry = {
          name, provider,
          email:       email    || '',
          avatar:      avatar   || '',
          uid:         id       || '',
          ua:          (ua||'').slice(0, 250),
          is_mobile:   !!isMobile,
          last_login:  now,
          login_count: existingCount + 1,
        };

        /* upsert: name+provider 중복 시 업데이트 */
        await sbFetch('/users?on_conflict=name,provider', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates',
          body: JSON.stringify(entry),
        });
        const eventType = isNew ? 'new_user' : 'login';
        const eventData = { name, provider, email, isMobile: !!isMobile, loginCount: entry.login_count };
        await Promise.allSettled([
          _tgNotify(eventType, eventData),
          _kakaoNotify(eventType, eventData),
        ]);
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

  /* ── PATCH: 사용자 정보 수정 (관리자 전용) ── */
  if (req.method === 'PATCH') {
    const auth = req.headers.authorization || '';
    if (!auth || auth !== `Bearer ${ADMIN_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const { name, provider, plan, credits, plan_expires } = body || {};
    if (!name || !provider) return res.status(400).json({ error: 'name and provider required' });

    const update = {};
    if (plan) update.plan = plan;
    if (typeof credits === 'number') update.credits = credits;
    if (plan_expires !== undefined) update.plan_expires = plan_expires;

    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'nothing to update' });

    try {
      await sbFetch(`/users?name=ilike.${encodeURIComponent(name)}&provider=eq.${encodeURIComponent(provider)}`, {
        method: 'PATCH',
        body: JSON.stringify(update),
      });
      return res.status(200).json({ success: true, updated: update });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  /* ── DELETE: 사용자 삭제 (관리자 전용) ── */
  if (req.method === 'DELETE') {
    const auth = req.headers.authorization || '';
    if (!auth || auth !== `Bearer ${ADMIN_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { name, provider, id } = req.query || {};
    if (!name && !id) return res.status(400).json({ error: 'name or id required' });
    try {
      let path;
      if (id) {
        path = `/users?id=eq.${encodeURIComponent(id)}`;
      } else {
        path = `/users?name=ilike.${encodeURIComponent(name)}`;
        if (provider) path += `&provider=eq.${encodeURIComponent(provider)}`;
      }
      await sbFetch(path, { method: 'DELETE' });
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
