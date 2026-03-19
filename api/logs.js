/**
 * /api/logs — Vercel 배포 로그 프록시 (CORS 우회용)
 * GET ?type=deployments   → 최근 배포 목록
 * GET ?type=events&id=xxx → 특정 배포 이벤트 로그
 */
const ADMIN_PWD = process.env.ADMIN_SECRET || 'kenny2024!';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '';
const VERCEL_PROJECT = 'prj_r8v4CSbHQQuS1WchTOq1LC0CsJ3F';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHdr = req.headers.authorization || '';
  const isAdmin = authHdr === `Bearer ${ADMIN_PWD}`;
  if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });

  const token = VERCEL_TOKEN;
  if (!token) return res.status(500).json({ error: 'VERCEL_TOKEN not configured' });

  const type = req.query?.type || 'deployments';
  const id   = req.query?.id || '';

  try {
    if (type === 'deployments') {
      const r = await fetch(
        `https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT}&limit=15&target=production`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const d = await r.json();
      return res.status(200).json(d);
    }
    if (type === 'events' && id) {
      const r = await fetch(
        `https://api.vercel.com/v2/deployments/${encodeURIComponent(id)}/events?limit=200`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const d = await r.json();
      return res.status(200).json(d);
    }
    return res.status(400).json({ error: 'Invalid type parameter' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
