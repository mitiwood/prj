/**
 * /api/profile — 크리에이터 프로필 조회
 *
 * GET ?name=xxx&provider=yyy → 프로필 + 곡 목록 + 통계
 * GET ?name=xxx&provider=yyy&action=following → 팔로잉 목록
 * GET ?name=xxx&provider=yyy&action=followers → 팔로워 목록
 * POST { action:'follow', followerName, followerProvider, followingName, followingProvider } → 팔로우/언팔로우
 * POST { action:'update-profile', name, provider, oldName } → 프로필 이름 수정
 * POST { action:'report', reporterName, reporterProvider, targetType, targetId, reason } → 신고
 * POST { action:'block', userName, userProvider, targetName, targetProvider } → 차단
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const SUPERVISOR_NAMES = (process.env.SUPERVISOR_NAMES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT = (process.env.TELEGRAM_CHAT_ID || '').trim();
const BASE = 'https://ddinggok.com';
const _profileRateMap = {}; /* Rate limit for profile updates */
const _activeSessionMap = {}; /* 활성화 알림: 세션당 최초 1회만 (true=이미 알림 완료) */
const _leaveNotifyCount = {}; /* 이탈 알림: 사용자당 최대 2회 카운트 */

async function _tgSend(text) {
  if (!TG_TOKEN || !TG_CHAT) return;
  const body = Buffer.from(JSON.stringify({ chat_id: TG_CHAT, text }), 'utf-8');
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(body.length) }, body
    });
  } catch (e) { console.warn('[profile tg]', e.message); }
}

async function sb(method, path, body = null) {
  if (!SB_URL || !SB_KEY) throw new Error('Supabase 미설정');
  const headers = {
    apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: method === 'GET' ? 'count=exact' : 'return=representation',
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`${SB_URL}/rest/v1${path}`, { ...opts, signal: controller.signal });
    clearTimeout(timeout);
    const txt = await r.text();
    const count = r.headers.get('content-range')?.match(/\/(\d+)/)?.[1];
    if (!r.ok) throw new Error(`SB ${r.status}: ${txt.slice(0, 100)}`);
    return { data: txt ? JSON.parse(txt) : [], count: count ? parseInt(count) : null };
  } catch (e) { clearTimeout(timeout); throw e; }
}

async function _notify(userName, userProvider, type, title, body, data = {}) {
  try {
    await sb('POST', '/notifications', {
      user_name: userName, user_provider: userProvider,
      type, title, body, data: JSON.stringify(data),
    });
  } catch (e) { console.warn('[notify]', e.message); }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* ── GET: 프로필 조회 ── */
  if (req.method === 'GET') {
    const name = req.query?.name;
    const provider = req.query?.provider;
    if (!name || !provider) return res.status(400).json({ error: 'name, provider 필요' });

    const action = req.query?.action;

    /* ── 팔로잉 목록 (병렬 쿼리) ── */
    if (action === 'following') {
      try {
        const { data: follows } = await sb('GET',
          `/follows?follower_name=eq.${encodeURIComponent(name)}&follower_provider=eq.${encodeURIComponent(provider)}&select=following_name,following_provider&order=created_at.desc&limit=50`);
        const list = Array.isArray(follows) ? follows : [];
        const following = await Promise.all(list.map(async f => {
          try {
            const [tc, fc, av] = await Promise.all([
              sb('GET', `/tracks?owner_name=eq.${encodeURIComponent(f.following_name)}&owner_provider=eq.${encodeURIComponent(f.following_provider)}&is_public=eq.true&select=id&limit=0`),
              sb('GET', `/follows?following_name=eq.${encodeURIComponent(f.following_name)}&following_provider=eq.${encodeURIComponent(f.following_provider)}&select=id&limit=0`),
              sb('GET', `/users?name=eq.${encodeURIComponent(f.following_name)}&provider=eq.${encodeURIComponent(f.following_provider)}&select=avatar&limit=1`),
            ]);
            const avatar = Array.isArray(av.data) && av.data[0] ? av.data[0].avatar : '';
            return { name: f.following_name, provider: f.following_provider, avatar, trackCount: tc.count || 0, followerCount: fc.count || 0 };
          } catch (e) {
            return { name: f.following_name, provider: f.following_provider, avatar: '', trackCount: 0, followerCount: 0 };
          }
        }));
        return res.status(200).json({ ok: true, following });
      } catch (e) {
        return res.status(200).json({ ok: false, error: e.message });
      }
    }

    /* ── 팔로워 목록 (병렬 쿼리) ── */
    if (action === 'followers') {
      try {
        const { data: follows } = await sb('GET',
          `/follows?following_name=eq.${encodeURIComponent(name)}&following_provider=eq.${encodeURIComponent(provider)}&select=follower_name,follower_provider&order=created_at.desc&limit=50`);
        const list = Array.isArray(follows) ? follows : [];
        const followers = await Promise.all(list.map(async f => {
          try {
            const [tc, fc, av] = await Promise.all([
              sb('GET', `/tracks?owner_name=eq.${encodeURIComponent(f.follower_name)}&owner_provider=eq.${encodeURIComponent(f.follower_provider)}&is_public=eq.true&select=id&limit=0`),
              sb('GET', `/follows?following_name=eq.${encodeURIComponent(f.follower_name)}&following_provider=eq.${encodeURIComponent(f.follower_provider)}&select=id&limit=0`),
              sb('GET', `/users?name=eq.${encodeURIComponent(f.follower_name)}&provider=eq.${encodeURIComponent(f.follower_provider)}&select=avatar&limit=1`),
            ]);
            const avatar = Array.isArray(av.data) && av.data[0] ? av.data[0].avatar : '';
            return { name: f.follower_name, provider: f.follower_provider, avatar, trackCount: tc.count || 0, followerCount: fc.count || 0 };
          } catch (e) {
            return { name: f.follower_name, provider: f.follower_provider, avatar: '', trackCount: 0, followerCount: 0 };
          }
        }));
        return res.status(200).json({ ok: true, followers });
      } catch (e) {
        return res.status(200).json({ ok: false, error: e.message });
      }
    }

    /* ── 배치 아바타 조회 (users 테이블 기준) ── */
    if (action === 'batch-avatars') {
      try {
        const names = req.query?.names; // comma-separated "name::provider" pairs
        if (!names) return res.status(400).json({ error: 'names 필요' });
        const pairs = names.split(',').slice(0, 50); // max 50
        const avatarMap = {};
        await Promise.all(pairs.map(async pair => {
          const [n, p] = pair.split('::');
          if (!n) return;
          try {
            const { data } = await sb('GET', `/users?name=eq.${encodeURIComponent(n)}&provider=eq.${encodeURIComponent(p || '')}&select=name,provider,avatar&limit=1`);
            if (Array.isArray(data) && data[0]) {
              avatarMap[pair] = data[0].avatar || '';
            }
          } catch {}
        }));
        return res.status(200).json({ ok: true, avatars: avatarMap });
      } catch (e) {
        return res.status(200).json({ ok: false, error: e.message });
      }
    }

    /* ── 전체 사용자 목록 (크리에이터 섹션용) ── */
    if (action === 'creators') {
      try {
        const { data: users } = await sb('GET',
          `/users?select=name,provider,avatar,plan,login_count&provider=neq.guest&provider=neq.mgr_manager&order=last_login.desc&limit=50`);
        /* 트랙 수 집계 */
        const { data: trackCounts } = await sb('GET',
          `/tracks?select=owner_name,owner_provider,is_public&is_public=eq.true`);
        const countMap = {};
        (trackCounts || []).forEach(t => {
          const k = (t.owner_name || '') + '__' + (t.owner_provider || '');
          countMap[k] = (countMap[k] || 0) + 1;
        });
        const result = (users || []).map(u => ({
          name: u.name, provider: u.provider, avatar: u.avatar || '',
          plan: u.plan || 'free', tracks: countMap[u.name + '__' + u.provider] || 0,
        }));
        return res.status(200).json({ ok: true, creators: result });
      } catch (e) {
        return res.status(200).json({ ok: false, creators: [], error: e.message });
      }
    }

    /* ── heartbeat + 접속자 수 + 활성화 알림 ── */
    if (action === 'heartbeat') {
      const hbName = req.query?.hbName;
      const hbProv = req.query?.hbProvider;
      try {
        const now = Date.now();
        if (hbName && hbProv) {
          await sb('PATCH', `/users?name=eq.${encodeURIComponent(hbName)}&provider=eq.${encodeURIComponent(hbProv)}`,
            { last_login: now, last_active: now });
          /* 텔레그램 활성화 알림 (최초 진입 시 1회만) */
          const sessionKey = hbName + '::' + hbProv;
          if (!_activeSessionMap[sessionKey]) {
            _activeSessionMap[sessionKey] = now;
            const provLabel = { google: 'Google', kakao: '카카오', naver: '네이버' }[hbProv] || hbProv;
            const time = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
            _tgSend('🟢 앱 활성화\n\n👤 ' + hbName + '\n🔗 ' + provLabel + '\n⏰ ' + time);
          }
        }
        /* 최근 5분 이내 활동 = 온라인 */
        const cutoff = now - 300000;
        const { data: online } = await sb('GET',
          `/users?last_active=gt.${cutoff}&provider=neq.guest&provider=neq.mgr_manager&select=name,provider,avatar&limit=50`);
        return res.status(200).json({ ok: true, count: (online || []).length, users: online || [] });
      } catch (e) {
        return res.status(200).json({ ok: true, count: 0, users: [] });
      }
    }

    /* ── 사용자 이탈 알림 (최대 2회) ── */
    if (action === 'leave') {
      const lName = req.query?.hbName;
      const lProv = req.query?.hbProvider;
      if (lName && lProv) {
        const lKey = lName + '::' + lProv;
        const cnt = _leaveNotifyCount[lKey] || 0;
        if (cnt < 2) {
          _leaveNotifyCount[lKey] = cnt + 1;
          /* 활성화 세션 초기화 (재방문 시 다시 활성화 알림 가능) */
          delete _activeSessionMap[lKey];
          const provLabel = { google: 'Google', kakao: '카카오', naver: '네이버' }[lProv] || lProv;
          const time = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
          _tgSend('🔴 사용자 이탈\n\n👤 ' + lName + '\n🔗 ' + provLabel + '\n⏰ ' + time + '\n📊 이탈 알림 ' + (cnt + 1) + '/2');
        }
      }
      return res.status(200).json({ ok: true });
    }

    /* ── 배치 팔로우 상태 확인 (N+1 제거) ── */
    if (action === 'batch-follow-check') {
      const viewerName = req.query?.viewerName;
      const viewerProvider = req.query?.viewerProvider;
      if (!viewerName || !viewerProvider) return res.status(400).json({ error: 'viewerName, viewerProvider 필요' });
      try {
        const { data: allFollows } = await sb('GET',
          `/follows?follower_name=eq.${encodeURIComponent(viewerName)}&follower_provider=eq.${encodeURIComponent(viewerProvider)}&select=following_name,following_provider&limit=200`);
        const set = {};
        (allFollows || []).forEach(f => { set[f.following_name + '__' + f.following_provider] = true; });
        return res.status(200).json({ ok: true, followingSet: set });
      } catch (e) {
        return res.status(200).json({ ok: false, error: e.message });
      }
    }

    /* ── 관리자: 전체 팔로우 목록 ── */
    if (action === 'admin-follows') {
      try {
        const { data: allFollows } = await sb('GET',
          `/follows?select=*&order=created_at.desc&limit=500`);
        return res.status(200).json({ ok: true, follows: allFollows || [] });
      } catch (e) {
        return res.status(200).json({ ok: false, follows: [], error: e.message });
      }
    }

    try {
      const viewerName = req.query?.viewerName;
      const viewerProvider = req.query?.viewerProvider;

      /* 병렬로 모든 쿼리 실행 — email 기반 매칭 우선 */
      const qEmail = req.query?.email;
      const userFilter = qEmail
        ? `email=eq.${encodeURIComponent(qEmail)}&provider=eq.${encodeURIComponent(provider)}`
        : `name=ilike.${encodeURIComponent(name)}&provider=eq.${encodeURIComponent(provider)}`;
      const trackFilter = qEmail
        ? `owner_email=eq.${encodeURIComponent(qEmail)}&owner_provider=eq.${encodeURIComponent(provider)}`
        : `owner_name=eq.${encodeURIComponent(name)}&owner_provider=eq.${encodeURIComponent(provider)}`;
      const promises = [
        sb('GET', `/users?${userFilter}&select=name,provider,email,avatar,plan,credits_song,credits_mv,credits_lyrics,login_count,created_at&limit=1`),
        sb('GET', `/tracks?${trackFilter}&audio_url=neq.&audio_url=not.is.null&order=created_at.desc&select=id,title,audio_url,image_url,video_url,tags,comm_likes,comm_dislikes,comm_plays,comm_rating,duration,created_at,is_public&limit=50`),
        sb('GET', `/follows?following_name=eq.${encodeURIComponent(name)}&following_provider=eq.${encodeURIComponent(provider)}&select=id&limit=0`).catch(() => ({ count: 0 })),
        sb('GET', `/follows?follower_name=eq.${encodeURIComponent(name)}&follower_provider=eq.${encodeURIComponent(provider)}&select=id&limit=0`).catch(() => ({ count: 0 })),
      ];
      if (viewerName && viewerProvider) {
        promises.push(
          sb('GET', `/follows?follower_name=eq.${encodeURIComponent(viewerName)}&follower_provider=eq.${encodeURIComponent(viewerProvider)}&following_name=eq.${encodeURIComponent(name)}&following_provider=eq.${encodeURIComponent(provider)}&select=id&limit=1`).catch(() => ({ data: [] }))
        );
      }

      const results = await Promise.all(promises);
      const users = results[0].data;
      const user = users[0] || { name, provider, avatar: '', plan: 'free' };
      /* SUPERVISOR_NAMES 환경변수 체크 → plan/credits 오버라이드 */
      const OWNER_EMAILS = ['altosax7@gmail.com'];
      if (SUPERVISOR_NAMES.includes((name || '').toLowerCase()) || OWNER_EMAILS.includes((user.email || '').toLowerCase())) {
        user.plan = 'supervisor';
        user.credits_song = 9999;
        user.credits_mv = 9999;
        user.credits_lyrics = 9999;
      }
      const tracks = results[1].data || [];
      const trackCount = results[1].count;
      const followerCount = results[2].count || 0;
      const followingCount = results[3].count || 0;
      const isFollowing = results[4] ? (results[4].data?.length > 0) : false;

      const totalLikes = tracks.reduce((s, t) => s + (t.comm_likes || 0), 0);
      const totalPlays = tracks.reduce((s, t) => s + (t.comm_plays || 0), 0);

      return res.status(200).json({
        ok: true,
        profile: {
          ...user,
          trackCount: trackCount || tracks.length || 0,
          totalLikes, totalPlays,
          followerCount, followingCount, isFollowing,
        },
        tracks,
      });
    } catch (e) {
      return res.status(200).json({ ok: false, error: e.message });
    }
  }

  /* ── POST: 팔로우 / 신고 / 차단 ── */
  if (req.method === 'POST') {
    /* sendBeacon은 POST로 전송 — query string의 action도 처리 */
    const qAction = req.query?.action;
    if (qAction === 'leave') {
      const lName = req.query?.hbName;
      const lProv = req.query?.hbProvider;
      if (lName && lProv) {
        const lKey = lName + '::' + lProv;
        const cnt = _leaveNotifyCount[lKey] || 0;
        if (cnt < 2) {
          _leaveNotifyCount[lKey] = cnt + 1;
          delete _activeSessionMap[lKey];
          const provLabel = { google: 'Google', kakao: '카카오', naver: '네이버' }[lProv] || lProv;
          const time = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
          _tgSend('🔴 사용자 이탈\n\n👤 ' + lName + '\n🔗 ' + provLabel + '\n⏰ ' + time + '\n📊 이탈 알림 ' + (cnt + 1) + '/2');
        }
      }
      return res.status(200).json({ ok: true });
    }

    const body = req.body || {};
    const action = body.action;

    /* 팔로우/언팔로우 */
    if (action === 'follow' || action === 'unfollow') {
      const { followerName, followerProvider, followingName, followingProvider } = body;
      if (!followerName || !followingName) return res.status(400).json({ error: '팔로우 정보 필요' });
      if (followerName === followingName && followerProvider === followingProvider) {
        return res.status(400).json({ error: '자기 자신을 팔로우할 수 없어요' });
      }

      try {
        if (action === 'unfollow') {
          await sb('DELETE',
            `/follows?follower_name=eq.${encodeURIComponent(followerName)}&follower_provider=eq.${encodeURIComponent(followerProvider)}&following_name=eq.${encodeURIComponent(followingName)}&following_provider=eq.${encodeURIComponent(followingProvider)}`);
          return res.status(200).json({ ok: true, action: 'unfollowed' });
        }
        /* 중복 체크 */
        const { data: existing } = await sb('GET',
          `/follows?follower_name=eq.${encodeURIComponent(followerName)}&follower_provider=eq.${encodeURIComponent(followerProvider)}&following_name=eq.${encodeURIComponent(followingName)}&following_provider=eq.${encodeURIComponent(followingProvider)}&select=id&limit=1`);
        if (existing?.length > 0) return res.status(200).json({ ok: true, already: true });

        await sb('POST', '/follows', {
          follower_name: followerName, follower_provider: followerProvider,
          following_name: followingName, following_provider: followingProvider,
        });

        /* 알림 */
        await _notify(followingName, followingProvider, 'follow',
          '새 팔로워!', `${followerName}님이 팔로우했어요`,
          { fromUser: followerName, fromProvider: followerProvider });

        return res.status(200).json({ ok: true, action: 'followed' });
      } catch (e) {
        return res.status(200).json({ ok: false, error: e.message });
      }
    }

    /* 신고 */
    if (action === 'report') {
      const { reporterName, reporterProvider, targetType, targetId, reason } = body;
      if (!reporterName || !targetType || !targetId) return res.status(400).json({ error: '신고 정보 필요' });

      try {
        await sb('POST', '/reports', {
          reporter_name: reporterName, reporter_provider: reporterProvider || '',
          target_type: targetType, target_id: targetId,
          reason: (reason || '').slice(0, 500), status: 'pending',
        });

        /* 관리자 봇 알림 */
        try {
          await fetch(`${BASE}/api/telegram`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
            body: JSON.stringify({ text: `🚩 신고 접수\n\n유형: ${targetType}\n대상: ${targetId}\n사유: ${(reason || '없음').slice(0, 100)}\n신고자: ${reporterName}` }),
          });
        } catch {}

        return res.status(200).json({ ok: true, message: '신고가 접수됐어요' });
      } catch (e) {
        return res.status(200).json({ ok: false, error: e.message });
      }
    }

    /* 차단 */
    if (action === 'block' || action === 'unblock') {
      /* 클라이언트 localStorage 기반 — 서버는 기록만 */
      return res.status(200).json({ ok: true, action, message: '클라이언트에서 처리' });
    }

    /* 프로필 수정 — Rate Limit (사용자당 10회/분) */
    if (action === 'update-profile') {
      const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim();
      const rateKey = (body.oldName || '') + '::' + (body.provider || '') + '::' + ip;
      const now = Date.now();
      if (!_profileRateMap[rateKey]) _profileRateMap[rateKey] = [];
      _profileRateMap[rateKey] = _profileRateMap[rateKey].filter(t => now - t < 60000);
      if (_profileRateMap[rateKey].length >= 10) return res.status(429).json({ error: '너무 많은 요청입니다' });
      _profileRateMap[rateKey].push(now);
      const { name: newName, provider: prov, oldName, bio, email: userEmail } = body;
      if (!newName || !prov) return res.status(400).json({ error: '이름/프로바이더 필요' });
      const trimmed = newName.trim().slice(0, 10);
      if (!trimmed) return res.status(400).json({ error: '이름이 비어있어요' });
      try {
        /* email+provider로 사용자 매칭 (email 없으면 oldName 폴백) */
        const userFilter = userEmail
          ? `email=eq.${encodeURIComponent(userEmail)}&provider=eq.${encodeURIComponent(prov)}`
          : `name=eq.${encodeURIComponent(oldName || trimmed)}&provider=eq.${encodeURIComponent(prov)}`;
        const updateData = { name: trimmed };
        if (typeof bio === 'string') {
          let existingUa = {};
          try {
            const rows = await sb('GET', `/users?${userFilter}&select=ua`);
            if (rows && rows[0] && rows[0].ua) existingUa = typeof rows[0].ua === 'string' ? JSON.parse(rows[0].ua) : rows[0].ua;
          } catch (_) {}
          updateData.ua = JSON.stringify({ ...existingUa, bio: bio.trim().slice(0, 100) });
        }
        await sb('PATCH', `/users?${userFilter}`, updateData);
        /* tracks 테이블: email 기반 매칭 우선, 없으면 oldName 폴백 */
        try {
          const trackFilter = userEmail
            ? `owner_email=eq.${encodeURIComponent(userEmail)}&owner_provider=eq.${encodeURIComponent(prov)}`
            : `owner_name=eq.${encodeURIComponent(oldName || trimmed)}&owner_provider=eq.${encodeURIComponent(prov)}`;
          await sb('PATCH', `/tracks?${trackFilter}`, { owner_name: trimmed });
        } catch (e) { console.warn('[update-profile] tracks update:', e.message); }
        return res.status(200).json({ ok: true, name: trimmed });
      } catch (e) {
        return res.status(200).json({ ok: false, error: e.message });
      }
    }

    return res.status(400).json({ error: 'unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
