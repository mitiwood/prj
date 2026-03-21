/**
 * /api/live-notify — 실시간 알림 API
 *
 * POST (admin): 알림 생성 → Supabase 저장 + 텔레그램/카카오 전송
 *   body: { title, body, icon?, type?, target? }
 *
 * GET: 클라이언트 폴링 — 새 알림 조회
 *   ?since=timestamp → 해당 시점 이후 알림 반환
 *
 * GET ?history=true (admin): 전체 이력 조회
 *
 * DELETE ?id=xxx (admin): 알림 삭제
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'kenny2024!';
const BASE = 'https://ai-music-studio-bice.vercel.app';

/* 인메모리 폴백 (Supabase 장애 시) */
let _mem = [];

function isAdmin(req) {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  return auth === ADMIN_SECRET;
}

async function sbFetch(method, path, body = null) {
  if (!SB_URL || !SB_KEY) throw new Error('Supabase 미설정');
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: method === 'GET' ? 'count=exact' : 'return=representation',
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`${SB_URL}/rest/v1${path}`, { ...opts, signal: controller.signal });
    clearTimeout(timeout);
    const txt = await r.text();
    if (!r.ok) throw new Error(`SB ${r.status}: ${txt.slice(0, 100)}`);
    return txt ? JSON.parse(txt) : [];
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

/* 테이블 자동 생성 (없으면) */
async function ensureTable() {
  try {
    await sbFetch('GET', '/live_notifications?select=id&limit=1');
  } catch (e) {
    if (e.message?.includes('404') || e.message?.includes('relation')) {
      /* 테이블이 없으면 RPC로 생성 시도 — 실패해도 메모리 폴백 */
      console.warn('[live-notify] table not found, using memory fallback');
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* ── GET: 알림 조회 ── */
  if (req.method === 'GET') {
    const since = parseInt(req.query?.since) || 0;
    const history = req.query?.history === 'true';

    /* 이력 조회 (관리자) */
    if (history) {
      if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
      try {
        const data = await sbFetch('GET', '/live_notifications?order=created_at.desc&limit=100');
        return res.status(200).json({ ok: true, notifications: data, source: 'supabase' });
      } catch {
        return res.status(200).json({ ok: true, notifications: _mem.slice().reverse(), source: 'memory' });
      }
    }

    /* 클라이언트 폴링: since 이후 알림 */
    try {
      const sinceISO = new Date(since).toISOString();
      const data = await sbFetch('GET', `/live_notifications?created_at=gt.${sinceISO}&order=created_at.desc&limit=10`);
      return res.status(200).json({ ok: true, notifications: data || [] });
    } catch {
      const filtered = _mem.filter(n => n.ts > since);
      return res.status(200).json({ ok: true, notifications: filtered, source: 'memory' });
    }
  }

  /* ── POST: 알림 생성 (관리자) ── */
  if (req.method === 'POST') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

    const { title, body: msgBody, icon, type, target } = req.body || {};
    if (!title && !msgBody) return res.status(400).json({ error: 'title 또는 body 필요' });

    const notification = {
      id: 'ln_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title: title || '',
      body: msgBody || '',
      icon: icon || '🔔',
      type: type || 'info',
      target: target || 'all',
      ts: Date.now(),
      created_at: new Date().toISOString(),
    };

    /* Supabase 저장 */
    let saved = false;
    try {
      await sbFetch('POST', '/live_notifications', notification);
      saved = true;
    } catch (e) {
      console.warn('[live-notify] supabase save failed:', e.message);
      _mem.push(notification);
      if (_mem.length > 100) _mem = _mem.slice(-100);
    }

    /* 텔레그램 알림 */
    try {
      const tgMsg = `🔔 실시간 알림 발송\n\n${notification.icon} ${notification.title}\n${notification.body}\n\n대상: ${notification.target}\n⏰ ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
      await fetch(`${BASE}/api/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
        body: JSON.stringify({ text: tgMsg, parse_mode: 'HTML' }),
      });
    } catch {}

    /* 카카오 알림 */
    try {
      await fetch(`${BASE}/api/kakao-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
        body: JSON.stringify({ text: `${notification.icon} ${notification.title}\n${notification.body}` }),
      });
    } catch {}

    return res.status(200).json({ ok: true, notification, saved: saved ? 'supabase' : 'memory' });
  }

  /* ── DELETE: 알림 삭제 (관리자) ── */
  if (req.method === 'DELETE') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: 'id 필요' });

    try {
      await sbFetch('DELETE', `/live_notifications?id=eq.${id}`);
    } catch {
      _mem = _mem.filter(n => n.id !== id);
    }
    return res.status(200).json({ ok: true, deleted: id });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
