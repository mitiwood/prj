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

async function sentryFetch(path) {
  if (!SENTRY_TOKEN) return { error: 'SENTRY_AUTH_TOKEN 미설정' };
  const r = await fetch(`${SENTRY_API}${path}`, {
    headers: { Authorization: `Bearer ${SENTRY_TOKEN}` },
  });
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

  /* 인증 */
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (auth !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

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

    return res.status(400).json({ error: `알 수 없는 action: ${action}` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
