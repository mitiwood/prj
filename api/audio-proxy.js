/**
 * /api/audio-proxy — 어드민 전용 오디오 URL 프록시
 * CORS 없는 외부 CDN 오디오를 브라우저에서 fetch 가능하도록 중계
 * 보안: 어드민 이름 검증 + 도메인 화이트리스트
 */

const ADMIN_NAMES = ['Kenny Lee', '이승호'];

/* 허용 도메인 (kie.ai CDN 관련) */
const ALLOWED_DOMAINS = [
  'cdn.kie.ai',
  'kieai',
  'kie.ai',
  'storage.googleapis.com',
  'cloudfront.net',
  'amazonaws.com',
  'suno.ai',
  'suno.com',
  'cdnjs',
];

function isDomainAllowed(url) {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_DOMAINS.some(d => hostname.includes(d));
  } catch { return false; }
}

export default async function handler(req, res) {
  /* CORS preflight */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') return res.status(405).end();

  const { url, name } = req.query;

  /* 어드민 검증 */
  if (!name || !ADMIN_NAMES.includes(decodeURIComponent(name))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  /* URL 검증 */
  if (!url) return res.status(400).json({ error: 'url required' });
  const decoded = decodeURIComponent(url);
  if (!isDomainAllowed(decoded)) {
    return res.status(400).json({ error: 'domain not allowed' });
  }

  try {
    const upstream = await fetch(decoded, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: 'upstream ' + upstream.status });
    }

    const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
    const buffer = await upstream.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.byteLength);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(Buffer.from(buffer));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
