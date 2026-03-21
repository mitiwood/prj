/**
 * /api/kie-proxy — kie.ai API 서버 프록시 (보안 강화)
 * - API 키는 서버에서만 관리 (클라이언트 노출 차단)
 * - 허용 경로 화이트리스트로 악용 방지
 * Usage: POST /api/kie-proxy  body: { path, method, body }
 */

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

function isPathAllowed(path) {
  if (!path || typeof path !== 'string') return false;
  return ALLOWED_PATHS.some(prefix => path.startsWith(prefix));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let payload = req.body || {};
  if (typeof payload === 'string') try { payload = JSON.parse(payload); } catch { payload = {}; }

  const { path, method = 'GET', body: reqBody } = payload;
  /* 서버 환경변수에서만 API 키 사용 — 클라이언트 apiKey 파라미터 무시 */
  const key = process.env.KIE_API_KEY;

  if (!key) return res.status(500).json({ error: 'KIE_API_KEY not configured' });
  if (!path) return res.status(400).json({ error: 'path required' });

  /* 경로 화이트리스트 검증 */
  if (!isPathAllowed(path)) {
    return res.status(403).json({ error: 'Path not allowed: ' + path });
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
