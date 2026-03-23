/**
 * /api/claude-chat — Claude AI 채팅 프록시
 * POST body: { messages: [{role,content}], userName?, userProvider? }
 * 스트리밍 SSE 응답
 */

import { withSentry } from './lib/sentry.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

const SYSTEM_PROMPT = `너는 Kenny's Music Studio의 AI 음악 어시스턴트야.
사용자가 음악 만들기, 작곡, 가사 쓰기, 장르 추천, 음악 이론 등에 대해 물어보면 친절하게 도와줘.
답변은 한국어로, 간결하고 친근하게 해줘. 이모지는 적당히 사용해.
음악과 무관한 질문도 가볍게 대화해줘. 너무 길게 답변하지 마.`;

/* 레이트 리밋 (유저당 분당 10회) */
const _rateMap = {};
function _checkRate(key) {
  const now = Date.now();
  if (!_rateMap[key]) _rateMap[key] = [];
  _rateMap[key] = _rateMap[key].filter(t => now - t < 60000);
  if (_rateMap[key].length >= 10) return false;
  _rateMap[key].push(now);
  return true;
}

async function _handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  let payload = req.body || {};
  if (typeof payload === 'string') try { payload = JSON.parse(payload); } catch { payload = {}; }

  const { messages, userName = 'guest', userProvider = 'guest' } = payload;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages required' });
  }

  /* 메시지 길이 제한 */
  if (messages.length > 20) {
    return res.status(400).json({ error: 'max 20 messages per request' });
  }

  /* 레이트 리밋 */
  const rateKey = `claude_${userName}_${userProvider}`;
  if (!_checkRate(rateKey)) {
    return res.status(429).json({ error: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.' });
  }

  /* 메시지 정제 (XSS 방지) */
  const cleanMessages = messages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 2000),
  }));

  try {
    /* 스트리밍 SSE */
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: cleanMessages,
        stream: true,
      }),
    });

    clearTimeout(timeout);

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      let errMsg = 'Claude API error';
      try { errMsg = JSON.parse(errText).error?.message || errMsg; } catch {}
      res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    /* SSE 스트림 전달 */
    const reader = apiRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullText += parsed.delta.text;
            res.write(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`);
          }
          if (parsed.type === 'message_stop') {
            // 완료
          }
        } catch {}
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

    /* 사용 로그 (fire-and-forget) */
    if (SB_URL && SB_KEY) {
      fetch(`${SB_URL}/rest/v1/bot_logs`, {
        method: 'POST',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          platform: 'claude-chat',
          command: cleanMessages[cleanMessages.length - 1]?.content?.slice(0, 100),
          user_name: userName,
          response: fullText.slice(0, 500),
          created_at: new Date().toISOString(),
        }),
      }).catch(() => {});
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      res.write(`data: ${JSON.stringify({ error: '응답 시간이 초과되었어요.' })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

export default withSentry(_handler);
