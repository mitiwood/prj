/**
 * /api/daily-discover — 오늘의 발견 + 일일 미션 시스템
 *
 * GET  ?userName=&userProvider= → 오늘의 추천 3곡 + 미션 상태
 * POST { userName, userProvider, trackId } → 곡 발견 완료 기록
 * POST { userName, userProvider, action:'claim' } → 미션 보상 수령
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

const DAILY_DISCOVER_COUNT = 3;   // 하루 추천 곡 수
const LISTEN_REWARD = 1;          // 미션 완료 보상 (곡 크레딧)
const STREAK_BONUS_RULES = {      // 연속 미션 완료 보너스
  7:  2,   // 7일 연속 → 추가 +2
  14: 3,   // 14일 연속 → 추가 +3
  30: 5,   // 30일 연속 → 추가 +5
};

async function sbFetch(method, path, body = null) {
  if (!SB_URL || !SB_KEY) throw new Error('Supabase 미설정');
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: method === 'GET' ? '' : 'return=representation',
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1${path}`, opts);
  const txt = await r.text();
  if (!r.ok) throw new Error(`SB ${r.status}: ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : [];
}

function todayKST() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

/** 사용자 좋아요 기반 장르 가중치 계산 */
async function getUserGenreWeights(userName, userProvider) {
  try {
    const likes = await sbFetch('GET',
      `/likes?user_name=ilike.${encodeURIComponent(userName)}&user_provider=ilike.${encodeURIComponent(userProvider)}&type=eq.like&limit=50&order=created_at.desc`
    );
    if (!likes.length) return null;

    const trackIds = likes.map(l => l.track_id).filter(Boolean);
    if (!trackIds.length) return null;

    // 최근 좋아요한 트랙들의 태그 수집
    const idFilter = trackIds.slice(0, 30).map(id => `"${id}"`).join(',');
    const tracks = await sbFetch('GET',
      `/tracks?id=in.(${idFilter})&select=id,tags&limit=30`
    );

    const genreCount = {};
    const GENRE_MAP = {
      kpop: ['k-pop','kpop','pop','korean'],
      hiphop: ['hip-hop','hiphop','rap','r&b'],
      lofi: ['lofi','lo-fi','chill','study'],
      electronic: ['edm','electronic','house','techno','synth'],
      ost: ['ost','cinematic','epic','film'],
      ballad: ['ballad','발라드'],
      rock: ['rock','록'],
      jazz: ['jazz','재즈'],
    };

    for (const t of tracks) {
      const tags = (t.tags || '').toLowerCase();
      for (const [genre, keywords] of Object.entries(GENRE_MAP)) {
        if (keywords.some(k => tags.includes(k))) {
          genreCount[genre] = (genreCount[genre] || 0) + 1;
        }
      }
    }
    return Object.keys(genreCount).length ? genreCount : null;
  } catch (e) {
    console.warn('[daily-discover] genre weight error:', e.message);
    return null;
  }
}

/** 시드 기반 의사 랜덤 (날짜+유저로 매일 같은 결과) */
function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return function() {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    return (h % 10000) / 10000;
  };
}

/** 추천 곡 선정 알고리즘 */
function pickDiscoverTracks(allTracks, genreWeights, seed, count) {
  // 유효한 오디오가 있는 공개 곡만
  const valid = allTracks.filter(t => t.audio_url && t.is_public !== false);
  if (valid.length <= count) return valid.slice(0, count);

  const rand = seededRandom(seed);

  // 장르 가중치 기반 점수 계산
  const scored = valid.map(t => {
    let score = rand() * 30; // 기본 랜덤 요소

    // 장르 매칭 보너스
    if (genreWeights) {
      const tags = (t.tags || '').toLowerCase();
      for (const [genre, weight] of Object.entries(genreWeights)) {
        const GENRE_MAP = {
          kpop: ['k-pop','kpop','pop','korean'],
          hiphop: ['hip-hop','hiphop','rap','r&b'],
          lofi: ['lofi','lo-fi','chill','study'],
          electronic: ['edm','electronic','house','techno','synth'],
          ost: ['ost','cinematic','epic','film'],
          ballad: ['ballad','발라드'],
          rock: ['rock','록'],
          jazz: ['jazz','재즈'],
        };
        const keywords = GENRE_MAP[genre] || [];
        if (keywords.some(k => tags.includes(k))) {
          score += weight * 10;
        }
      }
    }

    // 좋아요가 적당히 있는 곡 우선 (숨은 보석)
    const likes = t.comm_likes || t.like_count || 0;
    if (likes >= 1 && likes <= 20) score += 15;  // 숨은 보석 보너스
    else if (likes > 20) score += 5;

    // 최신 곡 약간 보너스
    if (t.created_at) {
      const age = (Date.now() - new Date(t.created_at).getTime()) / 86400000;
      if (age < 7) score += 10;
      else if (age < 30) score += 5;
    }

    return { track: t, score };
  });

  // 점수 높은 순 정렬 후 상위에서 선택
  scored.sort((a, b) => b.score - a.score);

  // 다양성 확보: 상위 20개 중에서 장르 겹치지 않게 선택
  const pool = scored.slice(0, Math.min(20, scored.length));
  const picked = [];
  const usedGenres = new Set();

  for (const item of pool) {
    if (picked.length >= count) break;
    const tags = (item.track.tags || '').toLowerCase();
    const genre = Object.entries({
      kpop: ['k-pop','kpop'], hiphop: ['hip-hop','rap'], lofi: ['lofi','lo-fi'],
      electronic: ['edm','electronic'], ost: ['ost','cinematic'],
    }).find(([, kws]) => kws.some(k => tags.includes(k)))?.[0] || 'other_' + picked.length;

    if (!usedGenres.has(genre) || picked.length >= count - 1) {
      picked.push(item.track);
      usedGenres.add(genre);
    }
  }

  // 부족하면 나머지에서 채움
  while (picked.length < count && pool.length > picked.length) {
    const next = pool.find(p => !picked.includes(p.track));
    if (next) picked.push(next.track);
    else break;
  }

  return picked;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const today = todayKST();

  try {
    const userName = req.query?.userName || req.body?.userName;
    const userProvider = req.query?.userProvider || req.body?.userProvider;

    if (!userName || !userProvider) {
      return res.status(400).json({ ok: false, reason: 'missing_user' });
    }

    const uName = encodeURIComponent(userName);
    const uProv = encodeURIComponent(userProvider);

    /* ── GET: 오늘의 추천 곡 + 미션 상태 ── */
    if (req.method === 'GET') {
      // 1) 오늘의 미션 기록 조회
      const missions = await sbFetch('GET',
        `/daily_missions?user_name=ilike.${uName}&user_provider=ilike.${uProv}&mission_date=eq.${today}&limit=1`
      );
      const mission = missions[0] || null;

      // 2) 추천 곡 결정 (시드 = 날짜 + 유저)
      const seed = today + '__' + userName + '__' + userProvider;

      let discoverTracks;
      if (mission && mission.track_ids) {
        // 이미 오늘 추천 받았으면 같은 곡 반환
        const ids = JSON.parse(mission.track_ids);
        const idFilter = ids.map(id => `"${id}"`).join(',');
        discoverTracks = await sbFetch('GET',
          `/tracks?id=in.(${idFilter})&select=id,title,tags,audio_url,image_url,user_name,user_provider,comm_likes,comm_plays,created_at`
        );
        // 원래 순서 복원
        discoverTracks.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      } else {
        // 새로 추천
        const genreWeights = await getUserGenreWeights(userName, userProvider);

        // 내 곡 제외를 위해 전체 곡 로드
        const allTracks = await sbFetch('GET',
          `/tracks?audio_url=neq.&audio_url=not.is.null&select=id,title,tags,audio_url,image_url,user_name,user_provider,comm_likes,comm_plays,created_at&order=created_at.desc&limit=500`
        );

        // 내 곡 제외
        const otherTracks = allTracks.filter(t =>
          !(t.user_name?.toLowerCase() === userName.toLowerCase() && t.user_provider?.toLowerCase() === userProvider.toLowerCase())
        );

        discoverTracks = pickDiscoverTracks(
          otherTracks.length >= DAILY_DISCOVER_COUNT ? otherTracks : allTracks,
          genreWeights,
          seed,
          DAILY_DISCOVER_COUNT
        );
      }

      // 3) 미션 연속 완료 스트릭 계산
      let streak = 0;
      try {
        const recentMissions = await sbFetch('GET',
          `/daily_missions?user_name=ilike.${uName}&user_provider=ilike.${uProv}&reward_claimed=eq.true&order=mission_date.desc&limit=31`
        );
        // 어제부터 역순으로 연속일 계산
        const yesterday = new Date(Date.now() + 9 * 3600000 - 86400000).toISOString().slice(0, 10);
        let checkDate = yesterday;
        for (const m of recentMissions) {
          if (m.mission_date === checkDate) {
            streak++;
            const d = new Date(checkDate);
            d.setDate(d.getDate() - 1);
            checkDate = d.toISOString().slice(0, 10);
          } else if (m.mission_date === today) {
            continue; // 오늘 것은 스킵
          } else {
            break;
          }
        }
        // 오늘 이미 완료했으면 +1
        if (mission?.reward_claimed) streak++;
      } catch (e) { /* 스트릭 실패해도 무시 */ }

      // 4) 발견 완료된 곡 ID 목록
      const discoveredIds = mission?.discovered_ids ? JSON.parse(mission.discovered_ids) : [];

      return res.status(200).json({
        ok: true,
        today,
        tracks: discoverTracks.map(t => ({
          id: t.id,
          title: t.title,
          tags: t.tags,
          audio_url: t.audio_url,
          image_url: t.image_url,
          user_name: t.user_name,
          user_provider: t.user_provider,
          likes: t.comm_likes || 0,
          plays: t.comm_plays || 0,
        })),
        mission: {
          discoveredIds,
          completedCount: discoveredIds.length,
          totalCount: DAILY_DISCOVER_COUNT,
          rewardClaimed: mission?.reward_claimed || false,
          streak,
        },
        reward: {
          base: LISTEN_REWARD,
          streakBonus: STREAK_BONUS_RULES,
        },
      });
    }

    /* ── POST: 곡 발견 완료 / 보상 수령 ── */
    if (req.method === 'POST') {
      const { trackId, action } = req.body || {};

      // 오늘 미션 조회 (없으면 생성)
      let missions = await sbFetch('GET',
        `/daily_missions?user_name=ilike.${uName}&user_provider=ilike.${uProv}&mission_date=eq.${today}&limit=1`
      );

      /* === 곡 발견 완료 기록 === */
      if (trackId && action !== 'claim') {
        let mission = missions[0];

        if (!mission) {
          // 미션 레코드 생성 (추천 곡 ID도 함께 저장)
          const created = await sbFetch('POST', '/daily_missions', {
            user_name: userName,
            user_provider: userProvider,
            mission_date: today,
            track_ids: JSON.stringify([trackId]),
            discovered_ids: JSON.stringify([trackId]),
            completed_count: 1,
            reward_claimed: false,
          });
          mission = created[0];
        } else {
          const discoveredIds = mission.discovered_ids ? JSON.parse(mission.discovered_ids) : [];
          if (discoveredIds.includes(trackId)) {
            return res.status(200).json({ ok: true, already: true, completedCount: discoveredIds.length });
          }
          discoveredIds.push(trackId);
          await sbFetch('PATCH',
            `/daily_missions?id=eq.${mission.id}`,
            {
              discovered_ids: JSON.stringify(discoveredIds),
              completed_count: discoveredIds.length,
            }
          );
          mission.discovered_ids = JSON.stringify(discoveredIds);
          mission.completed_count = discoveredIds.length;
        }

        const discoveredIds = mission.discovered_ids ? JSON.parse(mission.discovered_ids) : [];
        const allDone = discoveredIds.length >= DAILY_DISCOVER_COUNT;

        return res.status(200).json({
          ok: true,
          completedCount: discoveredIds.length,
          totalCount: DAILY_DISCOVER_COUNT,
          allDone,
          message: allDone
            ? '모든 곡을 발견했어요! 보상을 받아가세요'
            : `${discoveredIds.length}/${DAILY_DISCOVER_COUNT} 발견 완료`,
        });
      }

      /* === 보상 수령 === */
      if (action === 'claim') {
        const mission = missions[0];
        if (!mission) {
          return res.status(400).json({ ok: false, reason: '오늘 미션 기록이 없어요' });
        }
        if (mission.reward_claimed) {
          return res.status(200).json({ ok: true, already: true, message: '이미 보상을 받았어요' });
        }
        const discoveredIds = mission.discovered_ids ? JSON.parse(mission.discovered_ids) : [];
        if (discoveredIds.length < DAILY_DISCOVER_COUNT) {
          return res.status(400).json({ ok: false, reason: `아직 ${DAILY_DISCOVER_COUNT - discoveredIds.length}곡 더 들어야 해요` });
        }

        // 스트릭 계산
        let streak = 1;
        try {
          const yesterday = new Date(Date.now() + 9 * 3600000 - 86400000).toISOString().slice(0, 10);
          const recentMissions = await sbFetch('GET',
            `/daily_missions?user_name=ilike.${uName}&user_provider=ilike.${uProv}&reward_claimed=eq.true&order=mission_date.desc&limit=31`
          );
          let checkDate = yesterday;
          for (const m of recentMissions) {
            if (m.mission_date === checkDate) {
              streak++;
              const d = new Date(checkDate);
              d.setDate(d.getDate() - 1);
              checkDate = d.toISOString().slice(0, 10);
            } else {
              break;
            }
          }
        } catch (e) { /* 스트릭 실패해도 보상은 지급 */ }

        // 보상 계산
        let reward = LISTEN_REWARD;
        let streakBonus = 0;
        for (const [days, bonus] of Object.entries(STREAK_BONUS_RULES)) {
          if (streak >= Number(days)) streakBonus = bonus;
        }
        const totalReward = reward + streakBonus;

        // 미션 완료 표시
        await sbFetch('PATCH', `/daily_missions?id=eq.${mission.id}`, {
          reward_claimed: true,
          streak,
        });

        // 크레딧 지급
        try {
          const users = await sbFetch('GET',
            `/users?name=ilike.${uName}&provider=ilike.${uProv}&select=credits_song&limit=1`
          );
          if (users[0]) {
            const newCredits = (users[0].credits_song || 0) + totalReward;
            await sbFetch('PATCH',
              `/users?name=ilike.${uName}&provider=ilike.${uProv}`,
              { credits_song: newCredits }
            );
          }
        } catch (e) {
          console.warn('[daily-discover] credit update failed:', e.message);
        }

        return res.status(200).json({
          ok: true,
          reward: totalReward,
          baseReward: reward,
          streakBonus,
          streak,
          message: streakBonus > 0
            ? `${streak}일 연속 발견! +${totalReward}곡 (기본 ${reward} + 보너스 ${streakBonus})`
            : `+${totalReward}곡 크레딧 지급 완료!`,
        });
      }

      return res.status(400).json({ ok: false, reason: 'invalid_request' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[daily-discover]', e.message);
    return res.status(200).json({ ok: false, error: e.message, fallback: true });
  }
}
