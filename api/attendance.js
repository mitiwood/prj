/**
 * /api/attendance — 출석 체크 + 스트릭 + 보너스 크레딧 시스템
 *
 * GET  ?userName=&userProvider= → 출석 현황 조회 (이번 달 출석일, 연속 스트릭)
 * POST { userName, userProvider } → 오늘 출석 체크 (1일 1회, 보너스 크레딧 지급)
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

/* 연속 출석 보너스 규칙 */
const STREAK_BONUS = {
  3:  1,   // 3일 연속 → +1곡
  7:  3,   // 7일 연속 → +3곡
  14: 5,   // 14일 연속 → +5곡
  30: 10,  // 30일 연속 → +10곡
};

/* 복귀 유저 보너스 (3일 이상 미접속 후 복귀) */
const RETURN_BONUS = 2;
const RETURN_GAP_DAYS = 3;

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
  if (!r.ok) throw new Error(`SB ${r.status}: ${txt.slice(0, 100)}`);
  return txt ? JSON.parse(txt) : [];
}

function todayKST() {
  const d = new Date();
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function getMonthStartKST() {
  const d = new Date();
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 7) + '-01';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const today = todayKST();
  const monthStart = getMonthStartKST();

  try {
    /* ── 관리자 통계 조회 ── */
    if (req.method === 'GET' && req.query?.admin === 'true') {
      /* 오늘 출석자 목록 */
      const todayRecords = await sbFetch('GET',
        `/attendance?check_date=eq.${today}&order=created_at.desc&limit=500`
      );
      /* 이번 달 전체 기록 */
      const monthRecords = await sbFetch('GET',
        `/attendance?check_date=gte.${monthStart}&order=check_date.desc&limit=5000`
      );
      /* 스트릭 분포 계산 */
      const streakDist = {};
      const userMap = {};
      monthRecords.forEach(r => {
        const key = `${r.user_name}__${r.user_provider}`;
        if (!userMap[key] || r.streak > userMap[key].streak) {
          userMap[key] = r;
        }
      });
      Object.values(userMap).forEach(r => {
        const bucket = r.streak >= 30 ? '30+' : r.streak >= 14 ? '14-29' : r.streak >= 7 ? '7-13' : r.streak >= 3 ? '3-6' : '1-2';
        streakDist[bucket] = (streakDist[bucket] || 0) + 1;
      });
      /* 일별 출석 수 (최근 30일) */
      const dailyCounts = {};
      monthRecords.forEach(r => {
        dailyCounts[r.check_date] = (dailyCounts[r.check_date] || 0) + 1;
      });
      /* 총 지급 보너스 */
      const totalBonus = monthRecords.reduce((s, r) => s + (r.bonus_credits || 0), 0);

      return res.status(200).json({
        ok: true,
        todayCount: todayRecords.length,
        todayUsers: todayRecords.map(r => ({
          name: r.user_name,
          provider: r.user_provider,
          streak: r.streak,
          bonus: r.bonus_credits,
          time: r.created_at,
        })),
        monthTotal: monthRecords.length,
        uniqueUsers: Object.keys(userMap).length,
        streakDist,
        dailyCounts,
        totalBonus,
        streakBonusRules: STREAK_BONUS,
      });
    }

    /* ── 관리자: 특정 유저 출석 초기화/보너스 수동 지급 ── */
    if (req.method === 'POST' && req.body?.admin === true) {
      const { action, targetName, targetProvider, credits } = req.body;
      if (action === 'reset_streak') {
        /* 해당 유저의 모든 출석 기록 삭제 */
        await sbFetch('DELETE',
          `/attendance?user_name=ilike.${encodeURIComponent(targetName)}&user_provider=ilike.${encodeURIComponent(targetProvider)}`
        );
        return res.status(200).json({ ok: true, message: `${targetName} 출석 기록 초기화` });
      }
      if (action === 'grant_bonus') {
        /* 유저 크레딧에 보너스 수동 지급 */
        const users = await sbFetch('GET',
          `/users?name=ilike.${encodeURIComponent(targetName)}&provider=ilike.${encodeURIComponent(targetProvider)}&select=credits_song&limit=1`
        );
        if (users[0]) {
          const newCredits = (users[0].credits_song || 0) + (credits || 0);
          await sbFetch('PATCH',
            `/users?name=ilike.${encodeURIComponent(targetName)}&provider=ilike.${encodeURIComponent(targetProvider)}`,
            { credits_song: newCredits }
          );
        }
        return res.status(200).json({ ok: true, message: `${targetName}에게 ${credits}곡 보너스 지급` });
      }
      return res.status(400).json({ ok: false, reason: 'unknown_action' });
    }

    const userName = req.query?.userName || req.body?.userName;
    const userProvider = req.query?.userProvider || req.body?.userProvider;

    if (!userName || !userProvider) {
      return res.status(400).json({ ok: false, reason: 'missing_user' });
    }

    /* GET — 출석 현황 조회 */
    if (req.method === 'GET') {
      const records = await sbFetch('GET',
        `/attendance?user_name=ilike.${encodeURIComponent(userName)}&user_provider=ilike.${encodeURIComponent(userProvider)}&check_date=gte.${monthStart}&order=check_date.desc&limit=31`
      );

      const todayChecked = records.some(r => r.check_date === today);
      const currentStreak = records.length > 0 ? records[0].streak : 0;
      const monthDays = records.map(r => r.check_date);
      const totalBonus = records.reduce((sum, r) => sum + (r.bonus_credits || 0), 0);

      return res.status(200).json({
        ok: true,
        todayChecked,
        currentStreak,
        monthDays,
        monthCount: records.length,
        totalBonus,
        streakBonusRules: STREAK_BONUS,
      });
    }

    /* POST — 출석 체크 */
    if (req.method === 'POST') {
      /* 오늘 이미 출석했는지 확인 */
      const existing = await sbFetch('GET',
        `/attendance?user_name=ilike.${encodeURIComponent(userName)}&user_provider=ilike.${encodeURIComponent(userProvider)}&check_date=eq.${today}&limit=1`
      );
      if (existing.length > 0) {
        return res.status(200).json({ ok: true, already: true, streak: existing[0].streak, bonus: 0 });
      }

      /* 어제 출석 여부로 스트릭 계산 */
      const yesterday = new Date(new Date().getTime() + 9 * 60 * 60 * 1000 - 86400000).toISOString().slice(0, 10);
      const yesterdayRecord = await sbFetch('GET',
        `/attendance?user_name=ilike.${encodeURIComponent(userName)}&user_provider=ilike.${encodeURIComponent(userProvider)}&check_date=eq.${yesterday}&limit=1`
      );

      let streak = 1;
      let isReturn = false;

      if (yesterdayRecord.length > 0) {
        streak = (yesterdayRecord[0].streak || 0) + 1;
      } else {
        /* 마지막 출석일 확인 (복귀 유저 체크) */
        const lastRecord = await sbFetch('GET',
          `/attendance?user_name=ilike.${encodeURIComponent(userName)}&user_provider=ilike.${encodeURIComponent(userProvider)}&order=check_date.desc&limit=1`
        );
        if (lastRecord.length > 0) {
          const lastDate = new Date(lastRecord[0].check_date);
          const todayDate = new Date(today);
          const gapDays = Math.floor((todayDate - lastDate) / 86400000);
          if (gapDays >= RETURN_GAP_DAYS) isReturn = true;
        }
      }

      /* 보너스 크레딧 계산 */
      let bonus = 0;
      if (isReturn) bonus += RETURN_BONUS;
      if (STREAK_BONUS[streak]) bonus += STREAK_BONUS[streak];

      /* 출석 기록 저장 */
      await sbFetch('POST', '/attendance', {
        user_name: userName,
        user_provider: userProvider,
        check_date: today,
        streak,
        bonus_credits: bonus,
      });

      /* 보너스가 있으면 유저 크레딧에 반영 */
      if (bonus > 0) {
        try {
          const users = await sbFetch('GET',
            `/users?name=ilike.${encodeURIComponent(userName)}&provider=ilike.${encodeURIComponent(userProvider)}&select=credits_song&limit=1`
          );
          if (users[0]) {
            const newCredits = (users[0].credits_song || 0) + bonus;
            await sbFetch('PATCH',
              `/users?name=ilike.${encodeURIComponent(userName)}&provider=ilike.${encodeURIComponent(userProvider)}`,
              { credits_song: newCredits }
            );
          }
        } catch (e) {
          console.warn('[attendance] credit update failed:', e.message);
        }
      }

      return res.status(200).json({
        ok: true,
        streak,
        bonus,
        isReturn,
        message: isReturn
          ? `돌아오신 걸 환영합니다! 보너스 ${bonus}곡이 지급되었어요`
          : streak > 1
            ? `${streak}일 연속 출석!${bonus > 0 ? ` 보너스 ${bonus}곡 지급` : ''}`
            : '출석 체크 완료!',
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[attendance]', e.message);
    return res.status(200).json({ ok: false, error: e.message, fallback: true });
  }
}
