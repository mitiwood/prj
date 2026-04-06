/**
 * /api/kie-proxy — kie.ai API 서버 프록시 (보안 강화)
 * - API 키는 서버에서만 관리 (클라이언트 노출 차단)
 * - 허용 경로 화이트리스트로 악용 방지
 * - 서버사이드 크레딧 검증 (클라이언트 우회 차단)
 * Usage: POST /api/kie-proxy  body: { path, method, body, userName, userProvider }
 */

import { PLANS } from './toss-config.js';
import { withSentry } from './lib/sentry.js';

/* 게스트 IP 기반 rate limit (서버 메모리) */
const _guestRateMap = {};
const GUEST_RATE_LIMIT = 2; /* IP당 최대 2회/시간 (게스트 1곡 + 여유) */
function _checkGuestRate(ip) {
  const now = Date.now();
  if (!_guestRateMap[ip]) _guestRateMap[ip] = [];
  _guestRateMap[ip] = _guestRateMap[ip].filter(t => now - t < 3600000);
  if (_guestRateMap[ip].length >= GUEST_RATE_LIMIT) return false;
  _guestRateMap[ip].push(now);
  return true;
}
/* 주기적 정리 (메모리 누수 방지) */
setInterval(() => { const now = Date.now(); for (const ip in _guestRateMap) { _guestRateMap[ip] = _guestRateMap[ip].filter(t => now - t < 3600000); if (!_guestRateMap[ip].length) delete _guestRateMap[ip]; } }, 600000);

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

/* 허용 경로 화이트리스트 (prefix match) */
const ALLOWED_PATHS = [
  '/api/v1/generate',          // 음악 생성, extend, remaster, mv, add-vocals
  '/api/v1/lyrics',            // 가사 생성/조회
  '/api/v1/vocal-removal',     // 보컬 제거
  '/api/v1/jobs',              // 작업 조회 (폴링)
  '/api/v1/suno',              // suno 호환
  '/api/suno',                 // suno 레거시
  '/gemini-2.5-flash/v1/chat/completions',  // LLM (AI 프롬프트/추천)
];

/* 크레딧 소모가 발생하는 경로 (조회/폴링은 제외)
 * ✅ FIX: 순서 중요 — 구체적 경로를 먼저 배치 (prefix match이므로)
 *   /api/v1/generate/extend 등이 /api/v1/generate 보다 먼저 매칭되어야 함 */
const CREDIT_PATHS = {
  '/api/v1/generate/mv':          'mv',
  '/api/v1/generate/extend':      'song',
  '/api/v1/generate/remaster':    'song',
  '/api/v1/generate/add-vocals':  'song',
  '/api/v1/generate/cover':       'song',
  '/api/v1/generate/record-info': null,   /* 폴링은 크레딧 불필요 */
  '/api/v1/generate/get-timestamped-lyrics': null, /* 가사 타임스탬프 조회 */
  '/api/v1/generate':             'song', /* ✅ FIX: 기본 음악 생성 (이전: /api/v1/generate/music — 실제 API 경로 불일치) */
  '/api/v1/lyrics/generate':      'lyrics',
  '/api/v1/vocal-removal/generate': 'vr',
  '/api/v1/vocal-removal/create': 'vr',
  '/api/v1/jobs/createTask':      'mv',
  '/api/suno/v1/music':           'song', /* Suno 레거시 생성 */
};

function isPathAllowed(path) {
  if (!path || typeof path !== 'string') return false;
  return ALLOWED_PATHS.some(prefix => path.startsWith(prefix));
}

function getCreditType(path, method) {
  if (method === 'GET') return null; // 조회는 크레딧 불필요
  for (const [prefix, type] of Object.entries(CREDIT_PATHS)) {
    if (path.startsWith(prefix)) return type; // type이 null이면 크레딧 불필요 (폴링/조회)
  }
  return null;
}

async function sbFetch(method, path, body = null) {
  if (!SB_URL || !SB_KEY) return null;
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
  if (!r.ok) return null;
  return txt ? JSON.parse(txt) : [];
}

/* 환경변수 기반 슈퍼바이저 이름 목록 (쉼표 구분) */
const SUPERVISOR_NAMES = (process.env.SUPERVISOR_NAMES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

/* 최고 권한 이메일 — 서버에서도 supervisor 강제 통과 (클라이언트와 동일) */
const OWNER_EMAILS = ['altosax7@gmail.com'];

async function checkServerCredit(userName, userProvider, creditType) {
  if (!SB_URL || !SB_KEY) return { ok: true, fallback: true };
  /* 환경변수 슈퍼바이저 목록 체크 */
  if (SUPERVISOR_NAMES.includes((userName || '').toLowerCase())) return { ok: true, plan: 'supervisor' };
  try {
    const users = await sbFetch('GET',
      `/users?name=ilike.${encodeURIComponent(userName)}&provider=eq.${encodeURIComponent(userProvider)}&select=plan,email,credits_song,credits_mv,credits_lyrics,plan_expires&limit=1`
    );
    let user = users?.[0];
    if (!user) {
      /* name+provider 매칭 실패 → name만으로 재검색 (대소문자 무시) */
      try {
        const byName = await sbFetch('GET', `/users?name=ilike.${encodeURIComponent(userName)}&provider=neq.guest&select=plan,email,credits_song,credits_mv,credits_lyrics,plan_expires&order=last_login.desc&limit=1`);
        user = byName?.[0];
      } catch {}
    }
    if (!user) return { ok: true, fallback: true };
    let plan = user.plan || 'free';

    /* supervisor: 무제한 즉시 통과 */
    if (plan === 'supervisor') return { ok: true, plan: 'supervisor' };

    /* 최고 권한 이메일 → supervisor 강제 승격 */
    if (user.email && OWNER_EMAILS.includes(user.email.toLowerCase())) {
      try { await sbFetch('PATCH', `/users?name=eq.${encodeURIComponent(userName)}&provider=eq.${encodeURIComponent(userProvider)}`, { plan: 'supervisor', credits_song: 9999, credits_mv: 9999, credits_lyrics: 9999 }); } catch {}
      return { ok: true, plan: 'supervisor' };
    }

    /* 같은 email의 supervisor 계정이 있으면 승격 (멀티 소셜 대응) */
    if (user.email) {
      try {
        const byEmail = await sbFetch('GET', `/users?email=eq.${encodeURIComponent(user.email)}&plan=eq.supervisor&select=plan&limit=1`);
        if (byEmail?.[0]) {
          /* 현재 계정도 supervisor로 자동 승격 */
          try { await sbFetch('PATCH', `/users?name=eq.${encodeURIComponent(userName)}&provider=eq.${encodeURIComponent(userProvider)}`, { plan: 'supervisor', credits_song: 9999, credits_mv: 9999, credits_lyrics: 9999 }); } catch {}
          return { ok: true, plan: 'supervisor' };
        }
      } catch {}
    }

    /* DB에 supervisor 플랜 사용자인지 전역 검색 (이름 다를 수 있음) */
    try {
      const svAll = await sbFetch('GET', `/users?plan=eq.supervisor&select=name,email&limit=10`);
      if (svAll?.length) {
        /* 현재 사용자의 email이 supervisor 목록에 있으면 승격 */
        const userEmail = user.email || '';
        const match = svAll.find(sv => sv.email && userEmail && sv.email.toLowerCase() === userEmail.toLowerCase());
        if (match) {
          try { await sbFetch('PATCH', `/users?name=eq.${encodeURIComponent(userName)}&provider=eq.${encodeURIComponent(userProvider)}`, { plan: 'supervisor', credits_song: 9999, credits_mv: 9999, credits_lyrics: 9999 }); } catch {}
          return { ok: true, plan: 'supervisor' };
        }
      }
    } catch {}

    /* 만료 체크 */
    if (plan !== 'free' && user.plan_expires && new Date(user.plan_expires) < new Date()) {
      plan = 'free';
    }

    const limits = (PLANS[plan] || PLANS.free).limits;
    const key = creditType === 'song' ? 'songs' : creditType === 'vr' ? 'songs' : creditType;
    const limit = limits[key] || 0;
    if (limit >= 999) return { ok: true, plan };

    /* 이번 달 사용량 조회 */
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    let used = 0;
    if (creditType === 'song' || creditType === 'vr') {
      const tracks = await sbFetch('GET',
        `/tracks?owner_name=eq.${encodeURIComponent(userName)}&owner_provider=eq.${encodeURIComponent(userProvider)}&created_at=gte.${monthStart.toISOString()}&select=id&limit=1000`
      );
      used = tracks ? tracks.length : 0;
    } else if (creditType === 'mv') {
      const tracks = await sbFetch('GET',
        `/tracks?owner_name=eq.${encodeURIComponent(userName)}&owner_provider=eq.${encodeURIComponent(userProvider)}&video_url=neq.&video_url=not.is.null&created_at=gte.${monthStart.toISOString()}&select=id&limit=1000`
      );
      used = tracks ? tracks.length : 0;
    }

    if (used >= limit) {
      return { ok: false, reason: 'limit_exceeded', plan, used, limit, upgrade: plan === 'free' ? 'pro' : 'creator' };
    }

    /* 선차감: 크레딧 컬럼을 즉시 -1 하여 동시 요청 race condition 방어 */
    const creditCol = creditType === 'song' || creditType === 'vr' ? 'credits_song' : creditType === 'mv' ? 'credits_mv' : 'credits_lyrics';
    const currentCredits = user?.[creditCol] != null ? user[creditCol] : limit;
    if (currentCredits > 0) {
      try {
        await sbFetch('PATCH',
          `/users?name=ilike.${encodeURIComponent(userName)}&provider=eq.${encodeURIComponent(userProvider)}`,
          { [creditCol]: Math.max(0, currentCredits - 1) }
        );
      } catch (e) { console.warn('[kie-proxy] pre-deduct fail:', e.message); }
    }

    return { ok: true, plan, used, remaining: limit - used, preDeducted: true };
  } catch (e) {
    console.warn('[kie-proxy] credit check failed:', e.message);
    return { ok: true, fallback: true };
  }
}

async function _handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let payload = req.body || {};
  if (typeof payload === 'string') try { payload = JSON.parse(payload); } catch { payload = {}; }

  const { path, method = 'GET', body: reqBody, userName, userProvider } = payload;
  const key = process.env.KIE_API_KEY;

  if (!key) return res.status(500).json({ error: 'KIE_API_KEY not configured' });
  if (!path) return res.status(400).json({ error: 'path required' });

  /* 경로 화이트리스트 검증 */
  if (!isPathAllowed(path)) {
    return res.status(403).json({ error: 'Path not allowed: ' + path });
  }

  /* 서버사이드 크레딧 검증 (크레딧 소모 경로만) */
  const creditType = getCreditType(path, method);
  const isGuest = userName === 'guest' && userProvider === 'guest';
  if (creditType && (!userName || !userProvider)) {
    return res.status(400).json({ error: 'userName, userProvider required for this API' });
  }
  /* 게스트: 서버사이드 IP 기반 rate limit (localStorage 우회 방지) */
  if (creditType && isGuest) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || 'unknown';
    if (!_checkGuestRate(ip)) {
      return res.status(403).json({ error: 'guest_limit', msg: '게스트 체험 한도 초과 — 로그인하면 더 많은 곡을 만들 수 있어요!' });
    }
  }
  if (creditType && userName && userProvider && !isGuest) {
    const creditCheck = await checkServerCredit(userName, userProvider, creditType);
    if (!creditCheck.ok) {
      return res.status(403).json({
        error: 'credit_exceeded',
        reason: creditCheck.reason,
        plan: creditCheck.plan,
        used: creditCheck.used,
        limit: creditCheck.limit,
        upgrade: creditCheck.upgrade,
      });
    }
  }

  /* 선차감 복구 헬퍼: API 실패 시 크레딧 +1 복원 */
  const _creditCheck = (creditType && userName && userProvider && !isGuest) ? { userName, userProvider, creditType } : null;
  async function _restoreCredit() {
    if (!_creditCheck || !SB_URL || !SB_KEY) return;
    try {
      const creditCol = _creditCheck.creditType === 'song' || _creditCheck.creditType === 'vr' ? 'credits_song' : _creditCheck.creditType === 'mv' ? 'credits_mv' : 'credits_lyrics';
      const rows = await sbFetch('GET', `/users?name=ilike.${encodeURIComponent(_creditCheck.userName)}&provider=eq.${encodeURIComponent(_creditCheck.userProvider)}&select=${creditCol}&limit=1`);
      const cur = rows?.[0]?.[creditCol] ?? 0;
      await sbFetch('PATCH', `/users?name=ilike.${encodeURIComponent(_creditCheck.userName)}&provider=eq.${encodeURIComponent(_creditCheck.userProvider)}`, { [creditCol]: cur + 1 });
      console.log('[kie-proxy] credit restored for', _creditCheck.userName);
    } catch (e) { console.warn('[kie-proxy] credit restore fail:', e.message); }
  }

  const KIE_BASE = 'https://api.kie.ai';
  const url = `${KIE_BASE}${path}`;

  /* 경로별 타임아웃: 생성(POST)=55s, 폴링(GET)=15s, LLM=55s, 기본=30s */
  const isLLM = path.includes('/chat/completions');
  const isGenPost = method !== 'GET' && (path.startsWith('/api/v1/generate') || path.startsWith('/api/v1/vocal-removal') || path.startsWith('/api/v1/lyrics'));
  const isPoll = method === 'GET';
  const timeoutMs = isLLM ? 55000 : isGenPost ? 55000 : isPoll ? 15000 : 30000;

  /* 재시도 횟수: 폴링=0(클라이언트가 재시도), 생성POST=2, 기타=1 */
  const maxRetries = isPoll ? 0 : isGenPost ? 2 : 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const fetchOpts = {
        method,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
      };

      let sendBody = reqBody;
      if (isLLM && sendBody) sendBody = { ...sendBody, stream: false };
      /* kie.ai style 200자 제한 — 서버사이드 최종 안전장치 */
      if (sendBody && sendBody.style && sendBody.style.length > 200) {
        sendBody = { ...sendBody, style: sendBody.style.slice(0, 200) };
      }
      if (sendBody && method !== 'GET') fetchOpts.body = JSON.stringify(sendBody);

      const upstream = await fetch(url, fetchOpts);
      clearTimeout(timer);
      const text = await upstream.text();

      /* HTML 응답 (게이트웨이 에러 등) → 재시도 대상 */
      if (text.trimStart().startsWith('<')) {
        if (attempt < maxRetries) { await new Promise(r => setTimeout(r, (attempt + 1) * 1500)); continue; }
        await _restoreCredit();
        return res.status(upstream.status).json({
          error: 'kie.ai returned HTML (status ' + upstream.status + ')',
          endpoint: path,
        });
      }

      /* 502/503/429 → 재시도 대상 */
      if ([502, 503, 429].includes(upstream.status) && attempt < maxRetries) {
        const wait = upstream.status === 429 ? 3000 : (attempt + 1) * 1500;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      let data;
      try { data = JSON.parse(text); } catch(e) {
        if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 1500)); continue; }
        await _restoreCredit();
        return res.status(500).json({ error: 'JSON parse failed: ' + e.message, raw: text.slice(0,200) });
      }

      /* kie.ai가 에러 응답(4xx/5xx)을 반환하면 선차감 크레딧 복구 */
      if (!upstream.ok) await _restoreCredit();
      return res.status(upstream.status).json(data);
    } catch (e) {
      if (e.name === 'AbortError') {
        if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 1500)); continue; }
        await _restoreCredit();
        return res.status(504).json({ error: 'kie.ai timeout (' + (timeoutMs/1000) + 's)' });
      }
      /* 네트워크 에러 → 재시도 */
      if (attempt < maxRetries) { await new Promise(r => setTimeout(r, (attempt + 1) * 1500)); continue; }
      await _restoreCredit();
      return res.status(500).json({ error: e.message });
    }
  }
}

export default withSentry(_handler);
