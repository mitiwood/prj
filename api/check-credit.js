/**
 * /api/check-credit — 서버 크레딧 검증 API
 *
 * 생성 전: POST { userName, userProvider, type: 'song'|'mv'|'lyrics' }
 *   → plan/usage 검증 후 { ok:true, remaining } 또는 { ok:false, reason:'limit_exceeded' }
 *
 * 생성 후: POST { userName, userProvider, type, action:'deduct' }
 *   → 서버에서 사용량 +1 차감
 *
 * 플랜 정의는 toss-config.js에서 import (Single Source of Truth)
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

/* 플랜별 한도 — toss-config.js와 동일하게 유지 */
const PLAN_LIMITS = {
  free:    { songs: 5,   mv: 0,  lyrics: 5 },
  pro:     { songs: 50,  mv: 3,  lyrics: 50 },
  creator: { songs: 999, mv: 20, lyrics: 999 },
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
  if (!r.ok) throw new Error(`SB ${r.status}: ${txt.slice(0, 100)}`);
  return txt ? JSON.parse(txt) : [];
}

function getMonthKey() {
  const d = new Date();
  return d.getFullYear() + '' + (d.getMonth() + 1).toString().padStart(2, '0');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { userName, userProvider, type, action, newPlan } = req.body || {};
  if (!userName || !userProvider) {
    return res.status(400).json({ ok: false, reason: 'missing_user' });
  }

  /* 다운그레이드 요청 처리 */
  if (type === 'downgrade' && newPlan) {
    try {
      const limits = PLAN_LIMITS[newPlan] || PLAN_LIMITS.free;
      const patchData = { plan: newPlan, credits: limits.songs };
      if (newPlan === 'free') patchData.plan_expires = null;
      await sbFetch('PATCH',
        `/users?name=ilike.${encodeURIComponent(userName)}&provider=ilike.${encodeURIComponent(userProvider)}`,
        patchData
      );
      return res.status(200).json({ ok: true, plan: newPlan });
    } catch (e) {
      return res.status(200).json({ ok: false, error: e.message });
    }
  }

  if (!type || !['song', 'mv', 'lyrics'].includes(type)) {
    return res.status(400).json({ ok: false, reason: 'invalid_type' });
  }

  try {
    /* 1. 유저 조회 → plan 확인 */
    const users = await sbFetch('GET',
      `/users?name=ilike.${encodeURIComponent(userName)}&provider=ilike.${encodeURIComponent(userProvider)}&select=name,provider,plan,credits,plan_expires&limit=1`
    );
    const user = users[0];
    const plan = user?.plan || 'free';

    /* plan_expires 만료 체크 */
    if (plan !== 'free' && user?.plan_expires) {
      if (new Date(user.plan_expires) < new Date()) {
        /* 만료 → free로 다운그레이드 */
        await sbFetch('PATCH',
          `/users?name=ilike.${encodeURIComponent(userName)}&provider=ilike.${encodeURIComponent(userProvider)}`,
          { plan: 'free', credits: 5 }
        );
        return res.status(200).json({ ok: false, reason: 'plan_expired', plan: 'free' });
      }
    }

    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    const key = type === 'song' ? 'songs' : type;
    const limit = limits[key] || 0;

    /* 2. 이번 달 사용량 조회 (tracks 테이블에서 count) */
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    let used = 0;
    if (type === 'song') {
      const tracks = await sbFetch('GET',
        `/tracks?owner_name=ilike.${encodeURIComponent(userName)}&owner_provider=ilike.${encodeURIComponent(userProvider)}&created_at=gte.${monthStart.toISOString()}&select=id&limit=1000`
      );
      used = tracks.length;
    } else if (type === 'mv') {
      const tracks = await sbFetch('GET',
        `/tracks?owner_name=ilike.${encodeURIComponent(userName)}&owner_provider=ilike.${encodeURIComponent(userProvider)}&video_url=neq.&video_url=not.is.null&created_at=gte.${monthStart.toISOString()}&select=id&limit=1000`
      );
      used = tracks.length;
    } else {
      /* lyrics — 서버에서 정확히 추적하기 어려우므로 클라이언트 값 신뢰 */
      used = 0;
    }

    /* 3-a. action=set_plan → 관리자 플랜 변경 */
    if (action === 'set_plan') {
      const newPlan = req.body?.plan || 'free';
      const planCredits = { free: 5, pro: 50, creator: 999 };
      const expires = newPlan === 'free' ? null : new Date(Date.now() + 30*24*60*60*1000).toISOString();
      await sbFetch('PATCH',
        `/users?name=ilike.${encodeURIComponent(userName)}&provider=ilike.${encodeURIComponent(userProvider)}`,
        { plan: newPlan, credits: planCredits[newPlan] || 5, plan_expires: expires }
      );
      return res.status(200).json({ ok: true, plan: newPlan });
    }

    /* 3-b. action=deduct → 크레딧 차감 후 종료 */
    if (action === 'deduct') {
      const newCredits = Math.max(0, (user?.credits || 0) - 1);
      await sbFetch('PATCH',
        `/users?name=ilike.${encodeURIComponent(userName)}&provider=ilike.${encodeURIComponent(userProvider)}`,
        { credits: newCredits }
      );
      return res.status(200).json({ ok: true, credits: newCredits });
    }

    /* 3-b. 한도 체크 */
    if (limit < 999 && used >= limit) {
      return res.status(200).json({
        ok: false,
        reason: 'limit_exceeded',
        plan,
        type,
        used,
        limit,
        upgrade: plan === 'free' ? 'pro' : 'creator'
      });
    }

    return res.status(200).json({
      ok: true,
      plan,
      type,
      used,
      limit: limit >= 999 ? 'unlimited' : limit,
      remaining: limit >= 999 ? 'unlimited' : limit - used
    });

  } catch (e) {
    console.error('[check-credit]', e.message);
    /* Supabase 장애 시 허용 (graceful degradation) */
    return res.status(200).json({ ok: true, fallback: true, error: e.message });
  }
}
