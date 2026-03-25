/**
 * /api/sentry-register — Sentry 웹훅 등록/조회 (단독 엔드포인트)
 *
 * GET ?action=register → 웹훅 등록
 * GET ?action=list     → 기존 훅 조회
 * GET ?action=check    → 크리티컬 에러 체크 + 봇 알림
 */

const SENTRY_TOKEN = process.env.SENTRY_AUTH_TOKEN || '';
const SENTRY_ORG   = process.env.SENTRY_ORG || 'kenny-17';
const SENTRY_PROJ  = process.env.SENTRY_PROJECT || 'javascript';
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const SENTRY_API   = 'https://sentry.io/api/0';
const BASE         = 'https://ai-music-studio-bice.vercel.app';

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
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  if (auth !== ADMIN_SECRET && !isVercelCron) return res.status(401).json({ error: 'Unauthorized' });

  const action = req.query?.action || 'register';

  try {
    /* 웹훅 등록 */
    if (action === 'register') {
      const webhookUrl = `${BASE}/api/sentry-webhook`;
      const existing = await sentryFetch(`/projects/${SENTRY_ORG}/${SENTRY_PROJ}/hooks/`);
      if (Array.isArray(existing)) {
        const already = existing.find(h => h.url === webhookUrl);
        if (already) return res.status(200).json({ ok: true, message: '이미 등록됨', hook: { id: already.id, url: already.url, events: already.events } });
      }
      const hook = await sentryFetch(`/projects/${SENTRY_ORG}/${SENTRY_PROJ}/hooks/`, {
        method: 'POST',
        body: { url: webhookUrl, events: ['event.alert', 'event.created'] },
      });
      if (hook.error) return res.status(200).json({ ok: false, error: hook.error });
      return res.status(200).json({ ok: true, message: '웹훅 등록 완료', hook: { id: hook.id, url: hook.url, events: hook.events } });
    }

    /* 웹훅 목록 */
    if (action === 'list') {
      const hooks = await sentryFetch(`/projects/${SENTRY_ORG}/${SENTRY_PROJ}/hooks/`);
      return res.status(200).json(hooks);
    }

    /* 크리티컬 에러 체크 + 봇 알림 */
    if (action === 'check') {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const issues = await sentryFetch(
        `/projects/${SENTRY_ORG}/${SENTRY_PROJ}/issues/?query=is:unresolved+level:error+lastSeen:>${since}&sort=freq&limit=10`
      );
      if (issues.error) return res.status(200).json({ ok: false, error: issues.error });
      if (!Array.isArray(issues) || !issues.length) return res.status(200).json({ ok: true, critical: 0 });

      const critical = issues.filter(i => {
        const lvl = (i.level || '').toLowerCase();
        return (lvl === 'fatal' || lvl === 'error') && (parseInt(i.count) >= 5 || lvl === 'fatal');
      });
      if (!critical.length) return res.status(200).json({ ok: true, critical: 0 });

      const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const lines = critical.slice(0, 5).map((i, idx) => {
        const emoji = i.level === 'fatal' ? '🔴' : '🟡';
        return `${emoji} <b>${idx + 1}. ${esc((i.title || '').slice(0, 60))}</b>\n   ${esc((i.culprit || '').slice(0, 50))} · ${i.count}회`;
      });
      const tgText = `🚨 <b>Sentry 크리티컬 ${critical.length}건</b>\n\n${lines.join('\n\n')}`;

      await Promise.allSettled([
        fetch(`${BASE}/api/telegram`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
          body: JSON.stringify({ text: tgText, parse_mode: 'HTML' }),
        }),
        fetch(`${BASE}/api/kakao-notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `🚨 Sentry 크리티컬 ${critical.length}건\n${critical.slice(0, 3).map((i, idx) => `${idx + 1}. ${(i.title || '').slice(0, 50)} (${i.count}회)`).join('\n')}`.slice(0, 300) }),
        }),
      ]);
      return res.status(200).json({ ok: true, critical: critical.length, notified: true });
    }

    return res.status(400).json({ error: 'action: register, list, check' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
