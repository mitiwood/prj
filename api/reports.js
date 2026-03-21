/**
 * /api/reports — Supabase 신고 관리 API
 *
 * GET    ?limit=100&status=pending   Authorization: Admin → 신고 목록 조회
 * PATCH  body: {id, status}          Authorization: Admin → 신고 상태 변경 (resolved/ignored)
 * DELETE ?id=xxx                     Authorization: Admin → 신고 삭제
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PWD = process.env.ADMIN_SECRET || "kenny2024!";

async function sb(method, path, body = null) {
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: method === 'GET' ? 'count=exact' : 'return=representation',
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1${path}`, opts);
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { return txt; }
}

function isAdmin(req) {
  const auth = req.headers?.authorization || '';
  return auth === `Bearer ${ADMIN_PWD}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'DB not configured' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

  /* GET — 신고 목록 조회 */
  if (req.method === 'GET') {
    const { limit = '200', status } = req.query || {};
    let path = `/reports?order=created_at.desc&limit=${parseInt(limit) || 200}`;
    if (status && status !== 'all') path += `&status=eq.${status}`;
    try {
      const data = await sb('GET', path);
      return res.status(200).json({ ok: true, reports: Array.isArray(data) ? data : [] });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  /* PATCH — 상태 변경 */
  if (req.method === 'PATCH') {
    const { id, status } = req.body || {};
    if (!id || !['resolved', 'ignored', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'id and valid status required' });
    }
    try {
      await sb('PATCH', `/reports?id=eq.${id}`, { status });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  /* DELETE — 신고 삭제 */
  if (req.method === 'DELETE') {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      await sb('DELETE', `/reports?id=eq.${id}`);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
