/**
 * /api/sentry-proxy — Sentry API 프록시
 *
 * GET ?action=issues      → 최근 미해결 이슈 목록
 * GET ?action=stats       → 24시간 이벤트 통계
 * GET ?action=issue&id=XX → 특정 이슈 상세
 *
 * 인증: Authorization: Bearer ADMIN_SECRET
 */

const SENTRY_TOKEN = process.env.SENTRY_AUTH_TOKEN || '';
const SENTRY_ORG   = process.env.SENTRY_ORG || 'kenny-17';
const SENTRY_PROJ  = process.env.SENTRY_PROJECT || 'javascript';
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const SENTRY_API   = 'https://sentry.io/api/0';

async function sentryFetch(path, opts = {}) {
  if (!SENTRY_TOKEN) return { error: 'SENTRY_AUTH_TOKEN 미설정' };
  const fetchOpts = {
    method: opts.method || 'GET',
    headers: { Authorization: `Bearer ${SENTRY_TOKEN}`, 'Content-Type': 'application/json' },
  };
  if (opts.body) fetchOpts.body = JSON.stringify(opts.body);
  const r = await fetch(`${SENTRY_API}${path}`, fetchOpts);
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    return { error: `Sentry ${r.status}: ${txt.slice(0, 200)}` };
  }
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* 인증 — Vercel Cron 헤더 또는 ADMIN_SECRET */
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  const isVercelCron = req.headers['x-vercel-cron'] === '1' || req.headers['user-agent']?.includes('vercel-cron');
  if (auth !== ADMIN_SECRET && !isVercelCron) return res.status(401).json({ error: 'Unauthorized' });

  const action = req.query?.action || 'issues';

  try {
    if (action === 'issues') {
      const data = await sentryFetch(
        `/projects/${SENTRY_ORG}/${SENTRY_PROJ}/issues/?query=is:unresolved&sort=date&limit=${req.query?.limit || 20}`
      );
      return res.status(200).json(data);
    }

    if (action === 'stats') {
      const data = await sentryFetch(
        `/projects/${SENTRY_ORG}/${SENTRY_PROJ}/stats/?stat=received&resolution=1h&since=${Math.floor(Date.now() / 1000) - 86400}`
      );
      return res.status(200).json(data);
    }

    if (action === 'issue') {
      const id = req.query?.id;
      if (!id) return res.status(400).json({ error: 'id 필요' });
      const [issue, events] = await Promise.all([
        sentryFetch(`/issues/${id}/`),
        sentryFetch(`/issues/${id}/events/?limit=5`),
      ]);
      return res.status(200).json({ issue, events });
    }

    /* 봇용 요약 — 인증된 내부 호출 */
    if (action === 'summary') {
      const issues = await sentryFetch(
        `/projects/${SENTRY_ORG}/${SENTRY_PROJ}/issues/?query=is:unresolved&sort=date&limit=5`
      );
      if (issues.error) return res.status(200).json({ error: issues.error });

      const total = Array.isArray(issues) ? issues.length : 0;
      const summary = {
        total,
        issues: (issues || []).slice(0, 5).map(i => ({
          id: i.id,
          title: (i.title || '').slice(0, 80),
          culprit: (i.culprit || '').slice(0, 60),
          count: i.count,
          firstSeen: i.firstSeen,
          lastSeen: i.lastSeen,
          level: i.level,
        })),
      };
      return res.status(200).json(summary);
    }

    /* 웹훅 등록 */
    if (action === 'register-webhook') {
      const webhookUrl = 'https://ai-music-studio-bice.vercel.app/api/sentry-webhook';
      /* 기존 훅 조회 */
      const existing = await sentryFetch(`/projects/${SENTRY_ORG}/${SENTRY_PROJ}/hooks/`);
      if (Array.isArray(existing)) {
        const already = existing.find(h => h.url === webhookUrl);
        if (already) return res.status(200).json({ ok: true, message: '이미 등록됨', hook: { id: already.id, url: already.url, events: already.events } });
      }
      /* Service Hook 등록 */
      const hook = await sentryFetch(`/projects/${SENTRY_ORG}/${SENTRY_PROJ}/hooks/`, {
        method: 'POST',
        body: { url: webhookUrl, events: ['issue.created'] },
      });
      if (hook.error) return res.status(200).json({ ok: false, error: hook.error });
      return res.status(200).json({ ok: true, message: '웹훅 등록 완료', hook: { id: hook.id, url: hook.url, events: hook.events } });
    }

    /* 웹훅 목록 조회 */
    if (action === 'list-webhooks') {
      const hooks = await sentryFetch(`/projects/${SENTRY_ORG}/${SENTRY_PROJ}/hooks/`);
      return res.status(200).json(hooks);
    }

    /* 크리티컬 에러 체크 + 봇 알림 (Vercel Cron 또는 외부 호출용) */
    if (action === 'check-critical') {
      const BASE = 'https://ai-music-studio-bice.vercel.app';
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString(); /* 최근 30분 */
      const issues = await sentryFetch(
        `/projects/${SENTRY_ORG}/${SENTRY_PROJ}/issues/?query=is:unresolved+level:error+lastSeen:>${since}&sort=freq&limit=10`
      );
      if (issues.error) return res.status(200).json({ ok: false, error: issues.error });
      if (!Array.isArray(issues) || !issues.length) return res.status(200).json({ ok: true, critical: 0, message: '크리티컬 에러 없음' });

      /* fatal/error + 발생 5회 이상인 것만 필터 */
      const critical = issues.filter(i => {
        const lvl = (i.level || '').toLowerCase();
        return (lvl === 'fatal' || lvl === 'error') && (parseInt(i.count) >= 5 || lvl === 'fatal');
      });

      if (!critical.length) return res.status(200).json({ ok: true, critical: 0, message: '임계치 미달' });

      /* 텔레그램 알림 */
      const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const lines = critical.slice(0, 5).map((i, idx) => {
        const emoji = i.level === 'fatal' ? '🔴' : '🟡';
        return `${emoji} <b>${idx + 1}. ${esc((i.title || '').slice(0, 60))}</b>\n   ${esc((i.culprit || '').slice(0, 50))} · ${i.count}회`;
      });
      const tgText = `🚨 <b>Sentry 크리티컬 에러 ${critical.length}건</b>\n\n${lines.join('\n\n')}`;
      const kakaoText = `🚨 Sentry 크리티컬 에러 ${critical.length}건\n\n${critical.slice(0, 3).map((i, idx) => `${idx + 1}. ${(i.title || '').slice(0, 50)} (${i.count}회)`).join('\n')}`.slice(0, 300);

      await Promise.allSettled([
        fetch(`${BASE}/api/telegram`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
          body: JSON.stringify({ text: tgText, parse_mode: 'HTML' }),
        }),
        fetch(`${BASE}/api/kakao-notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: kakaoText }),
        }),
      ]);

      return res.status(200).json({ ok: true, critical: critical.length, notified: true });
    }

    return res.status(400).json({ error: `알 수 없는 action: ${action}` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
