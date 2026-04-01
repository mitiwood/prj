/**
 * /api/error-logs — 에러 로깅 + 모니터링 API
 *
 * POST { endpoint, method, status, error_message, user_agent } → 에러 기록
 * GET  → 최근 에러 목록 (관리자 전용)
 * GET  ?stats=true → 에러 통계 (관리자 전용)
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

/* 메모리 폴백 */
let _memLogs = [];
const MAX_MEM = 200;

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* POST — 에러 기록 (인증 불필요 — 프론트에서 호출) */
  if (req.method === 'POST') {
    const { endpoint, method, status, error_message, user_agent, notify } = req.body || {};
    const log = {
      endpoint: endpoint || 'unknown',
      method: method || 'GET',
      status: status || 500,
      error_message: String(error_message || '').slice(0, 500),
      user_agent: String(user_agent || '').slice(0, 200),
      ip: (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim(),
      created_at: new Date().toISOString(),
    };

    try {
      const result = await sbFetch('POST', '/error_logs', log);
      if (!result) {
        _memLogs.unshift({ ...log, id: 'mem-' + Date.now() });
        if (_memLogs.length > MAX_MEM) _memLogs = _memLogs.slice(0, MAX_MEM);
      }
    } catch {
      _memLogs.unshift({ ...log, id: 'mem-' + Date.now() });
      if (_memLogs.length > MAX_MEM) _memLogs = _memLogs.slice(0, MAX_MEM);
    }

    /* notify:true — 서버에서 텔레그램+카카오 알림 (클라이언트에 시크릿 노출 없이) */
    if (notify && ADMIN_SECRET) {
      const BASE = 'https://ddinggok.com';
      const alertText = log.error_message.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
      try {
        await Promise.allSettled([
          fetch(`${BASE}/api/telegram`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${ADMIN_SECRET}`}, body:JSON.stringify({text:alertText}) }),
          fetch(`${BASE}/api/kakao-notify`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${ADMIN_SECRET}`}, body:JSON.stringify({text:log.error_message.slice(0,300)}) }),
        ]);
      } catch {}
    }

    return res.status(200).json({ ok: true });
  }

  /* GET / DELETE — 관리자 전용 */
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (auth !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const stats = req.query?.stats === 'true';

    if (stats) {
      /* 통계: 최근 24시간 에러율, 엔드포인트별 카운트 */
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const logs = await sbFetch('GET', `/error_logs?created_at=gte.${since}&order=created_at.desc&limit=500`);
        const data = logs || _memLogs.filter(l => l.created_at >= since);

        const byEndpoint = {};
        const byHour = {};
        const byStatus = {};
        data.forEach(l => {
          byEndpoint[l.endpoint] = (byEndpoint[l.endpoint] || 0) + 1;
          const hour = l.created_at.slice(0, 13);
          byHour[hour] = (byHour[hour] || 0) + 1;
          const s = String(l.status || 500);
          byStatus[s] = (byStatus[s] || 0) + 1;
        });

        return res.status(200).json({
          ok: true,
          total24h: data.length,
          byEndpoint,
          byHour,
          byStatus,
        });
      } catch (e) {
        return res.status(200).json({ ok: false, error: e.message });
      }
    }

    /* 최근 에러 로그 목록 */
    const limit = Math.min(parseInt(req.query?.limit) || 50, 200);
    try {
      const logs = await sbFetch('GET', `/error_logs?order=created_at.desc&limit=${limit}`);
      return res.status(200).json({ ok: true, logs: logs || _memLogs.slice(0, limit) });
    } catch (e) {
      return res.status(200).json({ ok: true, logs: _memLogs.slice(0, limit) });
    }
  }

  /* DELETE — 오래된 로그 삭제 (30일 이상) */
  if (req.method === 'DELETE') {
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await sbFetch('DELETE', `/error_logs?created_at=lt.${cutoff}`);
      _memLogs = _memLogs.filter(l => l.created_at >= cutoff);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(200).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
