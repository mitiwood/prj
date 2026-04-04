/**
 * /api/slack-notify — Slack Incoming Webhook 알림
 * POST { text, event?, data? }
 */

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const SITE_URL = process.env.SITE_URL || 'https://ddinggok.com';

function formatMessage(body) {
  const { text, event, data } = body;

  if (event === 'music_created' && data) {
    return {
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: '🎵 음악 생성 완료', emoji: true } },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*사용자*\n${data.user || '익명'}` },
            { type: 'mrkdwn', text: `*모드*\n${data.mode || 'custom'}` },
            { type: 'mrkdwn', text: `*곡 제목*\n${data.title || '무제'}` },
            { type: 'mrkdwn', text: `*태그*\n${data.tags || '-'}` },
          ],
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `<${SITE_URL}|ddinggok.com> · ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}` }],
        },
      ],
    };
  }

  return { text: text || '(빈 메시지)' };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!WEBHOOK_URL) {
    return res.status(200).json({ ok: false, error: 'SLACK_WEBHOOK_URL not configured' });
  }

  const body = req.body || {};
  const payload = formatMessage(body);

  try {
    const jsonBody = JSON.stringify(payload);
    const r = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: Buffer.from(jsonBody, 'utf-8'),
    });

    if (!r.ok) {
      const err = await r.text();
      console.error('[slack-notify] error:', r.status, err);
      return res.status(200).json({ ok: false, error: err });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[slack-notify] fetch error:', e.message);
    return res.status(200).json({ ok: false, error: e.message });
  }
}
