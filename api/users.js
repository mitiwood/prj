/**
 * /api/users — 로그인 사용자 저장/조회
 * GET:  관리자 조회 (ADMIN_SECRET 인증)
 * POST: 로그인 이벤트 저장 (클라이언트에서 호출)
 *
 * Supabase 연동 우선, 실패 시 in-memory fallback
 */

import { verifyJWT } from './_jwt.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key
const ADMIN_SECRET = process.env.ADMIN_SECRET;

function _checkAdmin(req) {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (auth === ADMIN_SECRET) return 'admin';
  const jwt = verifyJWT(req);
  return jwt?.role || null;
}

function _checkWrite(req) {
  const role = _checkAdmin(req);
  return role === 'admin' || role === 'super';
}

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT = (process.env.TELEGRAM_CHAT_ID || '').trim();

/* in-memory fallback (Supabase 미연동 시) */
let _memStore = [];

async function _kakaoNotify(event, data) {
  try {
    await fetch('https://ddinggok.com/api/kakao-notify', {
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

  /* ── GET: 공개 엔드포인트 (인증 불필요) ── */
  if (req.method === 'GET' && req.query?.action === 'public-names') {
    try {
      const users = await sbFetch('/users?provider=neq.guest&provider=neq.mgr_manager&select=name&limit=500');
      const names = (users || []).map(u => u.name).filter(Boolean);
      return res.status(200).json({ ok: true, names });
    } catch (e) {
      return res.status(200).json({ ok: true, names: [] });
    }
  }

  /* ── GET: 관리자 조회 ── */
  if (req.method === 'GET') {
    if (!_checkAdmin(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    /* 활동 로그 조회 */
    if (req.query?.action === 'activity_logs') {
      const limit = Math.min(parseInt(req.query?.limit) || 100, 500);
      try {
        const logs = await sbFetch(`/bot_logs?platform=eq.user_activity&order=created_at.desc&limit=${limit}`);
        return res.status(200).json({ ok: true, logs: logs || [] });
      } catch (e) {
        return res.status(200).json({ ok: true, logs: [], error: e.message });
      }
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

      const { name, provider, email, avatar, id, ua, isMobile, lastLogin, loginCount, guestAction, guestUsage } = body;
      if (!name || !provider) return res.status(400).json({ error: 'name and provider required' });

      const now = typeof lastLogin === 'number' ? lastLogin : Date.now();

      /* ── 게스트 사용자 추적 ── */
      if (provider === 'guest') {
        const clientIp = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').split(',')[0].trim();
        let guestLocation = '';
        if (clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1') {
          try {
            const geoRes = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,regionName,city&lang=ko`);
            const geo = await geoRes.json();
            if (geo.status === 'success') guestLocation = [geo.regionName, geo.city].filter(Boolean).join(' ');
          } catch {}
        }
        try {
          let existingGuest = [];
          try { existingGuest = await sbFetch(`/users?name=eq.${encodeURIComponent(name)}&provider=eq.guest&select=login_count,credits_song`); } catch {}
          const gVisits = (existingGuest?.[0]?.login_count || 0) + (guestAction === 'start' ? 1 : 0);
          const gSongs = typeof guestUsage === 'number' ? guestUsage : (existingGuest?.[0]?.credits_song || 0);
          const gEntry = {
            name, provider: 'guest', email: '', avatar: '',
            ua: (ua || '').slice(0, 250), is_mobile: !!isMobile,
            last_login: Date.now(), login_count: Math.max(gVisits, 1),
            credits_song: gSongs, plan: 'guest',
            ...(clientIp ? { last_ip: clientIp } : {}),
            ...(guestLocation ? { last_location: guestLocation } : {}),
          };
          await sbFetch('/users?on_conflict=name,provider', {
            method: 'POST', prefer: 'resolution=merge-duplicates',
            body: JSON.stringify(gEntry),
          });
        } catch (e) { console.warn('[guest track]', e.message); }
        return res.status(200).json({ ok: true, guest: true });
      }

      /* IP 추출 + 위치 조회 */
      const clientIp = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').split(',')[0].trim();
      let location = '';
      if (clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1') {
        try {
          const geoRes = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,regionName,city&lang=ko`);
          const geo = await geoRes.json();
          if (geo.status === 'success') {
            location = [geo.regionName, geo.city].filter(Boolean).join(' ');
          }
        } catch {}
      }

      try {
        /* 기존 유저 조회 — 같은 이름(다른 provider 포함) 검색 */
        let existingCount = 0;
        let isNew = true;
        let existingProvider = null;
        const userEmail = email || '';
        try {
          let existing = null;
          /* 1) 같은 email+provider 매칭 */
          if (userEmail) {
            existing = await sbFetch(`/users?email=eq.${encodeURIComponent(userEmail)}&provider=eq.${encodeURIComponent(provider)}&select=login_count,name,provider`);
          }
          /* 2) 같은 name+provider 폴백 */
          if (!existing?.length) {
            existing = await sbFetch(`/users?name=eq.${encodeURIComponent(name)}&provider=eq.${encodeURIComponent(provider)}&select=login_count,name,provider`);
          }
          /* 3) 같은 이름인데 다른 provider로 등록된 기존 유저 (provider 전환 감지) */
          if (!existing?.length) {
            existing = await sbFetch(`/users?name=eq.${encodeURIComponent(name)}&provider=neq.guest&select=login_count,name,provider`);
            if (existing?.length > 0) {
              existingProvider = existing[0].provider; /* 기존 provider 기록 */
            }
          }
          if (existing?.length > 0) {
            existingCount = existing[0].login_count || 0;
            isNew = false;
          }
        } catch {}

        const entry = {
          name, provider,
          email:       userEmail,
          avatar:      (avatar || '').replace(/^http:\/\//i, 'https://'),
          uid:         id       || '',
          ua:          (ua||'').slice(0, 250),
          is_mobile:   !!isMobile,
          last_login:  now,
          login_count: existingCount + 1,
          ...(clientIp ? { last_ip: clientIp } : {}),
          ...(location ? { last_location: location } : {}),
          ...(isNew ? { plan: 'free', credits_song: 5, credits_mv: 0, credits_lyrics: 5 } : {}),
        };

        /* 기존 provider가 다르면 → 기존 레코드를 새 provider로 업데이트 */
        if (existingProvider && existingProvider !== provider) {
          try {
            await sbFetch(`/users?name=eq.${encodeURIComponent(name)}&provider=eq.${encodeURIComponent(existingProvider)}`, {
              method: 'PATCH',
              body: JSON.stringify(entry),
            });
            console.log(`[users] provider 전환: ${name} ${existingProvider} → ${provider}`);
          } catch (e) {
            console.warn('[users] provider 전환 실패:', e.message);
          }
        } else {
          /* upsert: name+provider 기준 */
          await sbFetch(`/users?on_conflict=name,provider`, {
            method: 'POST',
            prefer: 'resolution=merge-duplicates',
            body: JSON.stringify(entry),
          });
        }
        const isLogout = now === 1;
        const eventType = isLogout ? 'logout' : (isNew ? 'new_user' : 'login');
        const eventData = { name, provider, email, isMobile: !!isMobile, loginCount: entry.login_count };
        await Promise.allSettled([
          _tgNotify(eventType, eventData),
          _kakaoNotify(eventType, eventData),
        ]);

        /* bot_logs에 활동 로그 저장 */
        try {
          await sbFetch('/bot_logs', {
            method: 'POST',
            prefer: 'return=minimal',
            body: JSON.stringify({
              platform: 'user_activity',
              command: eventType,
              user_name: name,
              message: JSON.stringify({ event: eventType, name, provider, is_mobile: !!isMobile, location: location || '', ip: clientIp || '' }),
              created_at: new Date().toISOString(),
            }),
          });
        } catch {}

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

  /* ── PATCH: 사용자 정보 수정 (admin/super만) ── */
  if (req.method === 'PATCH') {
    if (!_checkWrite(req)) {
      return res.status(403).json({ error: 'Forbidden: admin/super only' });
    }
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const { name, provider, plan, credits, credits_song, credits_mv, credits_lyrics, plan_expires } = body || {};
    if (!name || !provider) return res.status(400).json({ error: 'name and provider required' });

    const update = {};
    if (plan) update.plan = plan;
    if (typeof credits_song === 'number') update.credits_song = credits_song;
    else if (typeof credits === 'number') update.credits_song = credits; /* 하위호환 */
    if (typeof credits_mv === 'number') update.credits_mv = credits_mv;
    if (typeof credits_lyrics === 'number') update.credits_lyrics = credits_lyrics;
    if (plan_expires !== undefined) update.plan_expires = plan_expires;

    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'nothing to update' });

    try {
      await sbFetch(`/users?name=eq.${encodeURIComponent(name)}&provider=eq.${encodeURIComponent(provider)}`, {
        method: 'PATCH',
        body: JSON.stringify(update),
      });

      /* 플랜 변경 시 알림 + realtime 이벤트 */
      if (plan) {
        const planNames = { free: 'Free', pro: 'Pro 💜', creator: 'Creator 👑' };
        const planLabel = planNames[plan] || plan;
        const msg = `🎫 플랜 변경\n\n👤 ${name}\n📋 ${planLabel}\n⏰ ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
        const ADMIN_SECRET = process.env.ADMIN_SECRET;
        await Promise.allSettled([
          _tgNotify('plan_change', { name, provider, plan }),
          _kakaoNotify('plan_change', { name, provider, plan }),
          /* plan_changed 이벤트 브로드캐스트 → 클라이언트 배지 즉시 갱신 */
          fetch(`${process.env.VERCEL_URL ? 'https://'+process.env.VERCEL_URL : 'https://ddinggok.com'}/api/realtime`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
            body: JSON.stringify({ event: 'plan_changed', data: { user: name, provider, plan, targetUser: name } }),
          }).catch(() => {}),
        ]);

        /* 해당 사용자에게 푸시 알림 */
        try {
          const subs = await sbFetch(`/push_subscriptions?user_name=eq.${encodeURIComponent(name)}&select=subscription`);
          if (Array.isArray(subs) && subs.length) {
            const webpush = (await import('web-push')).default;
            let vapidPub = process.env.VAPID_PUBLIC_KEY || '';
            const vapidPrv = process.env.VAPID_PRIVATE_KEY || '';
            if (vapidPub && vapidPrv) {
              try {
                const pad = '='.repeat((4 - vapidPub.length % 4) % 4);
                const raw = Buffer.from(vapidPub.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
                if (raw.length === 91) vapidPub = raw.slice(26).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
              } catch {}
              webpush.setVapidDetails('mailto:admin@ai-music-studio.app', vapidPub, vapidPrv);
              const payload = JSON.stringify({ title: '🎫 플랜이 변경되었어요!', body: planLabel + ' 플랜으로 업그레이드되었습니다', icon: '/icon-192.png', url: 'https://ddinggok.com' });
              for (const row of subs) {
                if (row.subscription?.endpoint) {
                  try { await webpush.sendNotification(row.subscription, payload); } catch {}
                }
              }
            }
          }
        } catch {}
      }

      return res.status(200).json({ success: true, updated: update });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  /* ── DELETE: 사용자 삭제 (admin/super만) ── */
  if (req.method === 'DELETE') {
    if (!_checkWrite(req)) {
      return res.status(403).json({ error: 'Forbidden: admin/super only' });
    }
    const { name, provider, id } = req.query || {};
    if (!name && !id) return res.status(400).json({ error: 'name or id required' });
    try {
      let path;
      if (id) {
        path = `/users?id=eq.${encodeURIComponent(id)}`;
      } else {
        path = `/users?name=eq.${encodeURIComponent(name)}`;
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
