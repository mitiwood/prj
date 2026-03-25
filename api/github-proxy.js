/**
 * /api/github-proxy — GitHub API 프록시 (private repo 접근용)
 *
 * GET ?path=/repos/OWNER/REPO/commits&per_page=30&page=1
 * GET ?path=/repos/OWNER/REPO/contents/docs
 * GET ?path=/repos/OWNER/REPO/contents/docs/FILE.md
 */

const GH_TOKEN = process.env.GITHUB_TOKEN || '';
const GH_REPO  = 'mitiwood/ai-music-studio';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  if (!GH_TOKEN) {
    return res.status(500).json({ ok: false, error: 'GITHUB_TOKEN not configured' });
  }

  /* 허용 경로 화이트리스트 */
  const ghPath = req.query?.path || '';
  const allowed = [
    `/repos/${GH_REPO}/commits`,
    `/repos/${GH_REPO}/contents`,
  ];
  if (!ghPath || !allowed.some(p => ghPath.startsWith(p))) {
    return res.status(400).json({ ok: false, error: 'Invalid path' });
  }

  /* 쿼리 파라미터 전달 (path 제외) */
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query || {})) {
    if (k !== 'path') params.set(k, v);
  }
  const qs = params.toString();
  const url = `https://api.github.com${ghPath}${qs ? '?' + qs : ''}`;

  try {
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'ai-music-studio-admin',
      },
    });

    /* GitHub 응답 헤더 전달 */
    const ct = r.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', ct);

    const data = await r.text();
    return res.status(r.status).send(data);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
