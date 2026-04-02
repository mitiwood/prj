/**
 * /api/check-credit — 서버 크레딧 검증 API
 *
 * 생성 전: POST { userName, userProvider, type: 'song'|'mv'|'lyrics'|'vr' }
 *   → plan/usage 검증 후 { ok:true, remaining } 또는 { ok:false, reason:'limit_exceeded' }
 *
 * 생성 후: POST { userName, userProvider, type, action:'deduct' }
 *   → 서버에서 사용량 +1 차감
 *
 * 플랜 정의는 toss-config.js에서 import (Single Source of Truth)
 */

import { PLANS } from './toss-config.js';
import { verifyJWT } from './_jwt.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const SUPERVISOR_NAMES = (process.env.SUPERVISOR_NAMES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

/* toss-config.js에서 가져온 플랜 한도 매핑 */
function getPlanLimits(planType) {
  const plan = PLANS[planType] || PLANS.free;
  return plan.limits || { songs: 5, mv: 0, lyrics: 5 };
}

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { userName, userProvider, type, action, newPlan } = req.body || {};
  if (!userName || !userProvider) {
    return res.status(400).json({ ok: false, reason: 'missing_user' });
  }

  /* 다운그레이드 요청 처리 — 본인 또는 관리자만 */
  if (type === 'downgrade' && newPlan) {
    const jwtUser = verifyJWT(req);
    const authHdr = (req.headers.authorization || '').replace('Bearer ', '');
    const isAdmin = ADMIN_SECRET && authHdr === ADMIN_SECRET;
    const isSelf = jwtUser && jwtUser.name === userName && jwtUser.provider === userProvider;
    if (!isAdmin && !isSelf) return res.status(403).json({ ok: false, reason: 'forbidden' });
    try {
      const limits = getPlanLimits(newPlan);
      const patchData = { plan: newPlan, credits_song: limits.songs, credits_mv: limits.mv, credits_lyrics: limits.lyrics };
      if (newPlan === 'free') patchData.plan_expires = null;
      await sbFetch('PATCH',
        `/users?name=eq.${encodeURIComponent(userName)}&provider=eq.${encodeURIComponent(userProvider)}`,
        patchData
      );
      return res.status(200).json({ ok: true, plan: newPlan });
    } catch (e) {
      return res.status(200).json({ ok: false, error: e.message });
    }
  }

  if (!type || !['song', 'mv', 'lyrics', 'vr'].includes(type)) {
    return res.status(400).json({ ok: false, reason: 'invalid_type' });
  }

  try {
    /* 1. 유저 조회 → plan 확인 */
    const users = await sbFetch('GET',
      `/users?name=eq.${encodeURIComponent(userName)}&provider=eq.${encodeURIComponent(userProvider)}&select=name,provider,plan,credits_song,credits_mv,credits_lyrics,plan_expires&limit=1`
    );
    const user = users[0];
    const plan = user?.plan || 'free';

    /* supervisor: 무제한 (DB plan 또는 환경변수 목록) */
    if (plan === 'supervisor' || SUPERVISOR_NAMES.includes((userName||'').toLowerCase())) {
      return res.status(200).json({ ok: true, plan: 'supervisor', remaining: 'unlimited', credits_song: 9999, credits_mv: 9999, credits_lyrics: 9999 });
    }

    /* plan_expires 만료 체크 */
    if (plan !== 'free' && user?.plan_expires) {
      if (new Date(user.plan_expires) < new Date()) {
        const freeLimits = getPlanLimits('free');
        await sbFetch('PATCH',
          `/users?name=eq.${encodeURIComponent(userName)}&provider=eq.${encodeURIComponent(userProvider)}`,
          { plan: 'free', credits_song: freeLimits.songs, credits_mv: freeLimits.mv, credits_lyrics: freeLimits.lyrics, plan_expires: null }
        );
        return res.status(200).json({ ok: false, reason: 'plan_expired', plan: 'free' });
      }
    }

    const limits = getPlanLimits(plan);
    const key = type === 'song' ? 'songs' : type;
    const limit = limits[key] || 0;

    /* 2. 이번 달 사용량 조회 (tracks 테이블에서 count) */
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    let used = 0;
    if (type === 'song') {
      const tracks = await sbFetch('GET',
        `/tracks?owner_name=eq.${encodeURIComponent(userName)}&owner_provider=eq.${encodeURIComponent(userProvider)}&created_at=gte.${monthStart.toISOString()}&select=id&limit=1000`
      );
      used = tracks.length;
    } else if (type === 'mv') {
      const tracks = await sbFetch('GET',
        `/tracks?owner_name=eq.${encodeURIComponent(userName)}&owner_provider=eq.${encodeURIComponent(userProvider)}&video_url=neq.&video_url=not.is.null&created_at=gte.${monthStart.toISOString()}&select=id&limit=1000`
      );
      used = tracks.length;
    } else {
      /* lyrics/vr — 서버에서 정확히 추적하기 어려우므로 클라이언트 값 신뢰 */
      used = 0;
    }

    /* 3-a. action=set_plan → 관리자 전용 플랜 변경 */
    if (action === 'set_plan') {
      const adminAuth = (req.headers.authorization || '').replace('Bearer ', '');
      if (!ADMIN_SECRET || adminAuth !== ADMIN_SECRET) return res.status(403).json({ ok: false, reason: 'admin_only' });
      const setPlan = req.body?.plan || 'free';
      const setLimits = getPlanLimits(setPlan);
      const expires = setPlan === 'free' ? null : new Date(Date.now() + 30*24*60*60*1000).toISOString();
      await sbFetch('PATCH',
        `/users?name=eq.${encodeURIComponent(userName)}&provider=eq.${encodeURIComponent(userProvider)}`,
        { plan: setPlan, credits_song: setLimits.songs, credits_mv: setLimits.mv, credits_lyrics: setLimits.lyrics, plan_expires: expires }
      );
      /* plan_changed 이벤트 브로드캐스트 → 클라이언트 배지 즉시 갱신 */
      try {
        await fetch(`${process.env.VERCEL_URL ? 'https://'+process.env.VERCEL_URL : 'https://ddinggok.com'}/api/realtime`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
          body: JSON.stringify({ event: 'plan_changed', data: { user: userName, provider: userProvider, plan: setPlan } }),
        });
      } catch (e) { console.warn('[realtime]', e.message); }
      return res.status(200).json({ ok: true, plan: setPlan });
    }

    /* 3-b. action=deduct → 크레딧 차감 (본인 JWT 또는 관리자만) */
    if (action === 'deduct') {
      const deductAuth = (req.headers.authorization || '').replace('Bearer ', '');
      const isAdminDeduct = ADMIN_SECRET && deductAuth === ADMIN_SECRET;
      const jwtUser = verifyJWT(req);
      const isSelf = jwtUser && jwtUser.name === userName && jwtUser.provider === userProvider;
      if (!isAdminDeduct && !isSelf) return res.status(403).json({ ok: false, reason: 'forbidden' });
      const creditCol = type === 'song' ? 'credits_song' : type === 'mv' ? 'credits_mv' : type === 'vr' ? 'credits_song' : 'credits_lyrics';
      /* NULL이면 플랜 기본값에서 차감 (|| 0 으로 처리하면 0→-1→0으로 크레딧이 소실됨) */
      const _deductDefault = type === 'song' ? limits.songs : type === 'mv' ? limits.mv : limits.songs;
      const currentCredits = user?.[creditCol] != null ? user[creditCol] : _deductDefault;
      const newCredits = Math.max(0, currentCredits - 1);
      await sbFetch('PATCH',
        `/users?name=eq.${encodeURIComponent(userName)}&provider=eq.${encodeURIComponent(userProvider)}`,
        { [creditCol]: newCredits }
      );
      return res.status(200).json({ ok: true, credits: newCredits, creditType: creditCol });
    }

    /* 3-c. 한도 체크 */
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
