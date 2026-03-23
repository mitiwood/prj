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
const BASE = 'https://ai-music-studio-bice.vercel.app';
const _profileRateMap = {}; /* Rate limit for profile updates */

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
          `/follows?follower_name=ilike.${encodeURIComponent(name)}&follower_provider=eq.${encodeURIComponent(provider)}&select=following_name,following_provider&order=created_at.desc&limit=50`);
        const list = Array.isArray(follows) ? follows : [];
        const following = await Promise.all(list.map(async f => {
          try {
            const [tc, fc, av] = await Promise.all([
              sb('GET', `/tracks?owner_name=ilike.${encodeURIComponent(f.following_name)}&owner_provider=ilike.${encodeURIComponent(f.following_provider)}&is_public=eq.true&select=id&limit=0`),
              sb('GET', `/follows?following_name=ilike.${encodeURIComponent(f.following_name)}&following_provider=eq.${encodeURIComponent(f.following_provider)}&select=id&limit=0`),
              sb('GET', `/users?name=ilike.${encodeURIComponent(f.following_name)}&provider=ilike.${encodeURIComponent(f.following_provider)}&select=avatar&limit=1`),
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
          `/follows?following_name=ilike.${encodeURIComponent(name)}&following_provider=eq.${encodeURIComponent(provider)}&select=follower_name,follower_provider&order=created_at.desc&limit=50`);
        const list = Array.isArray(follows) ? follows : [];
        const followers = await Promise.all(list.map(async f => {
          try {
            const [tc, fc, av] = await Promise.all([
              sb('GET', `/tracks?owner_name=ilike.${encodeURIComponent(f.follower_name)}&owner_provider=ilike.${encodeURIComponent(f.follower_provider)}&is_public=eq.true&select=id&limit=0`),
              sb('GET', `/follows?following_name=ilike.${encodeURIComponent(f.follower_name)}&following_provider=eq.${encodeURIComponent(f.follower_provider)}&select=id&limit=0`),
              sb('GET', `/users?name=ilike.${encodeURIComponent(f.follower_name)}&provider=ilike.${encodeURIComponent(f.follower_provider)}&select=avatar&limit=1`),
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
            const { data } = await sb('GET', `/users?name=ilike.${encodeURIComponent(n)}&provider=ilike.${encodeURIComponent(p || '')}&select=name,provider,avatar&limit=1`);
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

    /* ── heartbeat + 접속자 수 ── */
    if (action === 'heartbeat') {
      const hbName = req.query?.hbName;
      const hbProv = req.query?.hbProvider;
      try {
        if (hbName && hbProv) {
          await sb('PATCH', `/users?name=eq.${encodeURIComponent(hbName)}&provider=eq.${encodeURIComponent(hbProv)}`,
            { last_login: Date.now() });
        }
        /* 최근 5분 이내 활동 = 온라인 */
        const cutoff = Date.now() - 300000;
        const { data: online } = await sb('GET',
          `/users?last_login=gt.${cutoff}&provider=neq.guest&provider=neq.mgr_manager&select=name,provider,avatar&limit=50`);
        return res.status(200).json({ ok: true, count: (online || []).length, users: online || [] });
      } catch (e) {
        return res.status(200).json({ ok: true, count: 0, users: [] });
      }
    }

    /* ── 배치 팔로우 상태 확인 (N+1 제거) ── */
    if (action === 'batch-follow-check') {
      const viewerName = req.query?.viewerName;
      const viewerProvider = req.query?.viewerProvider;
      if (!viewerName || !viewerProvider) return res.status(400).json({ error: 'viewerName, viewerProvider 필요' });
      try {
        const { data: allFollows } = await sb('GET',
          `/follows?follower_name=ilike.${encodeURIComponent(viewerName)}&follower_provider=eq.${encodeURIComponent(viewerProvider)}&select=following_name,following_provider&limit=200`);
        const set = {};
        (allFollows || []).forEach(f => { set[f.following_name + '__' + f.following_provider] = true; });
        return res.status(200).json({ ok: true, followingSet: set });
      } catch (e) {
        return res.status(200).json({ ok: false, error: e.message });
      }
    }

    try {
      const viewerName = req.query?.viewerName;
      const viewerProvider = req.query?.viewerProvider;

      /* 병렬로 모든 쿼리 실행 */
      const promises = [
        sb('GET', `/users?name=ilike.${encodeURIComponent(name)}&provider=ilike.${encodeURIComponent(provider)}&select=name,provider,email,avatar,plan,credits_song,credits_mv,credits_lyrics,login_count,created_at&limit=1`),
        sb('GET', `/tracks?owner_name=ilike.${encodeURIComponent(name)}&owner_provider=ilike.${encodeURIComponent(provider)}&is_public=eq.true&order=created_at.desc&select=id,title,audio_url,image_url,video_url,tags,comm_likes,comm_dislikes,comm_plays,comm_rating,duration,created_at&limit=50`),
        sb('GET', `/follows?following_name=ilike.${encodeURIComponent(name)}&following_provider=eq.${encodeURIComponent(provider)}&select=id&limit=0`).catch(() => ({ count: 0 })),
        sb('GET', `/follows?follower_name=ilike.${encodeURIComponent(name)}&follower_provider=eq.${encodeURIComponent(provider)}&select=id&limit=0`).catch(() => ({ count: 0 })),
      ];
      if (viewerName && viewerProvider) {
        promises.push(
          sb('GET', `/follows?follower_name=ilike.${encodeURIComponent(viewerName)}&follower_provider=eq.${encodeURIComponent(viewerProvider)}&following_name=ilike.${encodeURIComponent(name)}&following_provider=eq.${encodeURIComponent(provider)}&select=id&limit=1`).catch(() => ({ data: [] }))
        );
      }

      const results = await Promise.all(promises);
      const users = results[0].data;
      const user = users[0] || { name, provider, avatar: '', plan: 'free' };
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
            `/follows?follower_name=ilike.${encodeURIComponent(followerName)}&follower_provider=eq.${encodeURIComponent(followerProvider)}&following_name=ilike.${encodeURIComponent(followingName)}&following_provider=eq.${encodeURIComponent(followingProvider)}`);
          return res.status(200).json({ ok: true, action: 'unfollowed' });
        }
        /* 중복 체크 */
        const { data: existing } = await sb('GET',
          `/follows?follower_name=ilike.${encodeURIComponent(followerName)}&follower_provider=eq.${encodeURIComponent(followerProvider)}&following_name=ilike.${encodeURIComponent(followingName)}&following_provider=eq.${encodeURIComponent(followingProvider)}&select=id&limit=1`);
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

    /* 프로필 수정 — Rate Limit (IP당 3회/분) */
    if (action === 'update-profile') {
      const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim();
      const now = Date.now();
      if (!_profileRateMap[ip]) _profileRateMap[ip] = [];
      _profileRateMap[ip] = _profileRateMap[ip].filter(t => now - t < 60000);
      if (_profileRateMap[ip].length >= 3) return res.status(429).json({ error: '너무 많은 요청입니다' });
      _profileRateMap[ip].push(now);
      const { name: newName, provider: prov, oldName, bio } = body;
      if (!newName || !prov || !oldName) return res.status(400).json({ error: '이름/프로바이더 필요' });
      const trimmed = newName.trim().slice(0, 30);
      if (!trimmed) return res.status(400).json({ error: '이름이 비어있어요' });
      try {
        const updateData = { name: trimmed };
        if (typeof bio === 'string') updateData.ua = JSON.stringify({ ...(JSON.parse('{}') || {}), bio: bio.trim().slice(0, 100) });
        await sb('PATCH',
          `/users?name=ilike.${encodeURIComponent(oldName)}&provider=ilike.${encodeURIComponent(prov)}`,
          updateData);
        try {
          await sb('PATCH',
            `/tracks?owner_name=ilike.${encodeURIComponent(oldName)}&owner_provider=ilike.${encodeURIComponent(prov)}`,
            { owner_name: trimmed });
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
