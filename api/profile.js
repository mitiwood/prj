/**
 * /api/profile — 크리에이터 프로필 조회
 *
 * GET ?name=xxx&provider=yyy → 프로필 + 곡 목록 + 통계
 * GET ?name=xxx&provider=yyy&action=follow → 팔로우 상태 확인
 * POST { action:'follow', followerName, followerProvider, followingName, followingProvider } → 팔로우/언팔로우
 * POST { action:'report', reporterName, reporterProvider, targetType, targetId, reason } → 신고
 * POST { action:'block', userName, userProvider, targetName, targetProvider } → 차단
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'kenny2024!';
const BASE = 'https://ai-music-studio-bice.vercel.app';

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

    try {
      /* 유저 정보 */
      const { data: users } = await sb('GET',
        `/users?name=eq.${encodeURIComponent(name)}&provider=eq.${encodeURIComponent(provider)}&select=name,provider,email,avatar,plan,credits,login_count,created_at&limit=1`);
      const user = users[0] || { name, provider, avatar: '', plan: 'free' };

      /* 곡 목록 */
      const { data: tracks, count: trackCount } = await sb('GET',
        `/tracks?owner_name=eq.${encodeURIComponent(name)}&owner_provider=eq.${encodeURIComponent(provider)}&is_public=eq.true&order=created_at.desc&select=id,title,audio_url,image_url,tags,comm_likes,comm_plays,created_at&limit=50`);

      /* 통계 */
      const totalLikes = (tracks || []).reduce((s, t) => s + (t.comm_likes || 0), 0);
      const totalPlays = (tracks || []).reduce((s, t) => s + (t.comm_plays || 0), 0);

      /* 팔로워/팔로잉 수 */
      let followerCount = 0, followingCount = 0;
      try {
        const { count: fc } = await sb('GET',
          `/follows?following_name=eq.${encodeURIComponent(name)}&following_provider=eq.${encodeURIComponent(provider)}&select=id&limit=0`);
        followerCount = fc || 0;
      } catch {}
      try {
        const { count: fc } = await sb('GET',
          `/follows?follower_name=eq.${encodeURIComponent(name)}&follower_provider=eq.${encodeURIComponent(provider)}&select=id&limit=0`);
        followingCount = fc || 0;
      } catch {}

      /* 팔로우 여부 확인 (viewer 기준) */
      let isFollowing = false;
      const viewerName = req.query?.viewerName;
      const viewerProvider = req.query?.viewerProvider;
      if (viewerName && viewerProvider) {
        try {
          const { data: fw } = await sb('GET',
            `/follows?follower_name=eq.${encodeURIComponent(viewerName)}&follower_provider=eq.${encodeURIComponent(viewerProvider)}&following_name=eq.${encodeURIComponent(name)}&following_provider=eq.${encodeURIComponent(provider)}&select=id&limit=1`);
          isFollowing = fw?.length > 0;
        } catch {}
      }

      return res.status(200).json({
        ok: true,
        profile: {
          ...user,
          trackCount: trackCount || tracks?.length || 0,
          totalLikes, totalPlays,
          followerCount, followingCount, isFollowing,
        },
        tracks: tracks || [],
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

    return res.status(400).json({ error: 'unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
