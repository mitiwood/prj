/**
 * /api/kie-proxy — kie.ai API 서버 프록시 (보안 강화)
 * - API 키는 서버에서만 관리 (클라이언트 노출 차단)
 * - 허용 경로 화이트리스트로 악용 방지
 * - 서버사이드 크레딧 검증 (클라이언트 우회 차단)
 * Usage: POST /api/kie-proxy  body: { path, method, body, userName, userProvider }
 */

import { PLANS } from './toss-config.js';

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

/* 크레딧 소모가 발생하는 경로 (조회/폴링은 제외) */
const CREDIT_PATHS = {
  '/api/v1/generate/music':       'song',
  '/api/v1/generate/mv':          'mv',
  '/api/v1/generate/extend':      'song',
  '/api/v1/generate/remaster':    'song',
  '/api/v1/generate/add-vocals':  'song',
  '/api/v1/generate/cover':       'song',
  '/api/v1/lyrics/generate':      'lyrics',
  '/api/v1/vocal-removal/create': 'vr',
};

function isPathAllowed(path) {
  if (!path || typeof path !== 'string') return false;
  return ALLOWED_PATHS.some(prefix => path.startsWith(prefix));
}

function getCreditType(path, method) {
  if (method === 'GET') return null; // 조회는 크레딧 불필요
  for (const [prefix, type] of Object.entries(CREDIT_PATHS)) {
    if (path.startsWith(prefix)) return type;
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

async function checkServerCredit(userName, userProvider, creditType) {
  if (!SB_URL || !SB_KEY) return { ok: true, fallback: true };
  try {
    const users = await sbFetch('GET',
      `/users?name=ilike.${encodeURIComponent(userName)}&provider=ilike.${encodeURIComponent(userProvider)}&select=plan,credits_song,credits_mv,credits_lyrics,plan_expires&limit=1`
    );
    if (!users || !users[0]) return { ok: true, fallback: true };
    const user = users[0];
    let plan = user.plan || 'free';

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
        `/tracks?owner_name=ilike.${encodeURIComponent(userName)}&owner_provider=ilike.${encodeURIComponent(userProvider)}&created_at=gte.${monthStart.toISOString()}&select=id&limit=1000`
      );
      used = tracks ? tracks.length : 0;
    } else if (creditType === 'mv') {
      const tracks = await sbFetch('GET',
        `/tracks?owner_name=ilike.${encodeURIComponent(userName)}&owner_provider=ilike.${encodeURIComponent(userProvider)}&video_url=neq.&video_url=not.is.null&created_at=gte.${monthStart.toISOString()}&select=id&limit=1000`
      );
      used = tracks ? tracks.length : 0;
    }

    if (used >= limit) {
      return { ok: false, reason: 'limit_exceeded', plan, used, limit, upgrade: plan === 'free' ? 'pro' : 'creator' };
    }
    return { ok: true, plan, used, remaining: limit - used };
  } catch (e) {
    console.warn('[kie-proxy] credit check failed:', e.message);
    return { ok: true, fallback: true };
  }
}

export default async function handler(req, res) {
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
  if (creditType && userName && userProvider) {
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

  const KIE_BASE = 'https://api.kie.ai';
  const url = `${KIE_BASE}${path}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const fetchOpts = {
      method,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
    };
    if (reqBody && method !== 'GET') fetchOpts.body = JSON.stringify(reqBody);

    /* LLM 호출은 stream:false 강제 + 타임아웃 60초 */
    const isLLM = path.includes('/chat/completions');
    if (isLLM) {
      clearTimeout(timeout);
      const llmTimeout = setTimeout(() => controller.abort(), 60000);
      if (reqBody) reqBody.stream = false;
      if (reqBody && method !== 'GET') fetchOpts.body = JSON.stringify(reqBody);
      const upstream = await fetch(url, fetchOpts);
      clearTimeout(llmTimeout);
      const text = await upstream.text();
      let data;
      try { data = JSON.parse(text); } catch(e) {
        return res.status(500).json({ error: 'LLM parse failed', raw: text.slice(0,300) });
      }
      return res.status(upstream.status).json(data);
    }

    const upstream = await fetch(url, fetchOpts);
    clearTimeout(timeout);
    const text = await upstream.text();

    if (text.trimStart().startsWith('<')) {
      return res.status(upstream.status).json({
        error: 'kie.ai returned HTML (status ' + upstream.status + ')',
        endpoint: path,
      });
    }

    let data;
    try { data = JSON.parse(text); } catch(e) {
      return res.status(500).json({ error: 'JSON parse failed: ' + e.message, raw: text.slice(0,200) });
    }

    return res.status(upstream.status).json(data);
  } catch (e) {
    if (e.name === 'AbortError') return res.status(504).json({ error: 'kie.ai timeout (30s)' });
    return res.status(500).json({ error: e.message });
  }
}
