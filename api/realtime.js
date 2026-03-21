/**
 * /api/realtime — Server-Sent Events (SSE) 엔드포인트
 *
 * GET → SSE 스트림 연결. 서버에서 이벤트 발생 시 클라이언트에 실시간 전송.
 * POST { event, data } → 이벤트 브로드캐스트 (관리자)
 *
 * 이벤트 타입: plan_changed, new_like, new_comment, new_follow, announcement, system
 */

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'kenny2024!';

/* 인메모리 이벤트 큐 (최근 50개) — Vercel serverless는 stateless이므로 폴링 대안 */
let _events = [];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* POST: 이벤트 발행 (관리자/서버 내부) */
  if (req.method === 'POST') {
    const auth = (req.headers.authorization || '').replace('Bearer ', '');
    if (auth !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

    const { event, data } = req.body || {};
    if (!event) return res.status(400).json({ error: 'event required' });

    const entry = { event, data: data || {}, ts: Date.now(), id: Date.now() + '_' + Math.random().toString(36).slice(2, 6) };
    _events.push(entry);
    if (_events.length > 50) _events = _events.slice(-50);

    return res.status(200).json({ ok: true, entry });
  }

  /* GET: 폴링 (SSE는 Vercel serverless에서 제한적 → 빠른 폴링으로 대체) */
  if (req.method === 'GET') {
    const since = parseInt(req.query?.since) || 0;
    const userName = req.query?.user || '';

    const filtered = _events.filter(e => e.ts > since);

    /* 유저별 필터링 (해당 유저에게만 보여야 할 이벤트) */
    const forUser = filtered.filter(e => {
      if (!e.data?.targetUser) return true; /* 전체 대상 */
      return e.data.targetUser === userName;
    });

    return res.status(200).json({
      ok: true,
      events: forUser,
      serverTime: Date.now(),
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
