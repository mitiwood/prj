/**
 * /api/claude-chat — 케니 음악 어시스턴트 채팅 API
 * POST body: { messages: [{role,content}], userName?, userProvider? }
 * Anthropic API 우선, 없으면 kie.ai Gemini LLM 폴백
 * 스트리밍 SSE 응답
 */

import { withSentry } from './lib/sentry.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const KIE_API_KEY = process.env.KIE_API_KEY;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

const SYSTEM_PROMPT = `당신은 Kenny's Music Studio의 AI 음악 어시스턴트입니다.

[필수 규칙]
- 반드시 한국어로만 답변하세요. 영어로 절대 답변하지 마세요. 사용자가 영어로 질문해도 한국어로 답변하세요.
- 친근한 반말체(~야, ~해, ~지)로 대화하세요.
- 답변은 3~5문장 이내로 간결하게 해주세요.
- 이모지는 1~2개 정도만 적당히 사용하세요.
- 볼드(**) 마크다운을 절대 사용하지 마세요. 일반 텍스트로만 답변하세요.

[역할]
- 음악 만들기, 작곡, 가사 쓰기, 장르 추천, 음악 이론 질문에 친절하게 도와줘.
- 음악과 무관한 질문도 가볍게 대화해줘.
- Kenny's Music Studio는 AI로 음악을 생성하는 서비스야. 사용자가 사이트 기능에 대해 물어보면 안내해줘.`;

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

/* kie.ai Gemini LLM 호출 (non-streaming) */
async function _kieGeminiChat(messages) {
  const url = 'https://api.kie.ai/gemini-2.5-flash/v1/chat/completions';
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 1024,
      stream: false,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || 'LLM error ' + r.status);
  return data?.choices?.[0]?.message?.content || '';
}

async function _handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!ANTHROPIC_API_KEY && !KIE_API_KEY) {
    return res.status(500).json({ error: 'AI API key not configured' });
  }

  let payload = req.body || {};
  if (typeof payload === 'string') try { payload = JSON.parse(payload); } catch { payload = {}; }

  const { messages, userName = 'guest', userProvider = 'guest' } = payload;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages required' });
  }
  if (messages.length > 20) {
    return res.status(400).json({ error: 'max 20 messages per request' });
  }

  const rateKey = `chat_${userName}_${userProvider}`;
  if (!_checkRate(rateKey)) {
    return res.status(429).json({ error: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.' });
  }

  const cleanMessages = messages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 2000),
  }));

  /* SSE 헤더 */
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let fullText = '';

  try {
    if (ANTHROPIC_API_KEY) {
      /* ── Anthropic Claude 스트리밍 ── */
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
        let errMsg = 'API error';
        try { errMsg = JSON.parse(errText).error?.message || errMsg; } catch {}
        /* Anthropic 실패 시 kie.ai 폴백 */
        if (KIE_API_KEY) {
          fullText = await _kieGeminiChat(cleanMessages);
          res.write(`data: ${JSON.stringify({ text: fullText })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      const reader = apiRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
          } catch {}
        }
      }
    } else {
      /* ── kie.ai Gemini LLM (non-streaming) ── */
      fullText = await _kieGeminiChat(cleanMessages);
      res.write(`data: ${JSON.stringify({ text: fullText })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();

    /* 사용 로그 (fire-and-forget) */
    if (SB_URL && SB_KEY) {
      fetch(`${SB_URL}/rest/v1/bot_logs`, {
        method: 'POST',
        headers: {
          apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          platform: 'kenny-chat',
          command: cleanMessages[cleanMessages.length - 1]?.content?.slice(0, 100),
          user_name: userName,
          response: fullText.slice(0, 500),
          created_at: new Date().toISOString(),
        }),
      }).catch(() => {});
    }
  } catch (e) {
    /* Anthropic 실패 시 kie.ai 폴백 시도 */
    if (KIE_API_KEY && !fullText) {
      try {
        fullText = await _kieGeminiChat(cleanMessages);
        res.write(`data: ${JSON.stringify({ text: fullText })}\n\n`);
      } catch (e2) {
        res.write(`data: ${JSON.stringify({ error: e2.message || e.message })}\n\n`);
      }
    } else {
      res.write(`data: ${JSON.stringify({ error: e.name === 'AbortError' ? '응답 시간이 초과되었어요.' : e.message })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

export default withSentry(_handler);
