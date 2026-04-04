/**
 * /api/slack-notify — Slack Incoming Webhook 알림
 * POST { text, event?, data? }
 */

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const SITE_URL = process.env.SITE_URL || 'https://ddinggok.com';

function formatMessage(body) {
  const { text, event, data } = body;

  if (event === 'music_created' && data) {
    const audioUrl = data.audio_url || '';
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: '\uD83C\uDFB5 \uC74C\uC545 \uC0DD\uC131 \uC644\uB8CC', emoji: true } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: '*\uC0AC\uC6A9\uC790*\n' + (data.user || '\uC775\uBA85') },
          { type: 'mrkdwn', text: '*\uBAA8\uB4DC*\n' + (data.mode || 'custom') },
          { type: 'mrkdwn', text: '*\uACE1 \uC81C\uBAA9*\n' + (data.title || '\uBB34\uC81C') },
          { type: 'mrkdwn', text: '*\uD0DC\uADF8*\n' + (data.tags || '-') },
        ],
      },
    ];
    if (audioUrl) {
      blocks.push({
        type: 'actions',
        elements: [{ type: 'button', text: { type: 'plain_text', text: '\uD83C\uDFA7 \uC7AC\uC0DD\uD558\uAE30', emoji: true }, url: audioUrl }],
      });
    }
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '<' + SITE_URL + '|ddinggok.com> \xB7 ' + new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) }],
    });
    return { blocks };
  }

  return { text: text || '' };
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
    const r = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
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
