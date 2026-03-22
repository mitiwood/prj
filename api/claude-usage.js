/**
 * /api/claude-usage — Anthropic API 사용량 조회
 * Anthropic Admin API로 조직 사용량 조회
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_ADMIN_KEY = process.env.ANTHROPIC_ADMIN_KEY || '';
const ADMIN_SECRET = process.env.ADMIN_SECRET;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (auth !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const result = {
    apiKeyConfigured: !!ANTHROPIC_API_KEY,
    adminKeyConfigured: !!ANTHROPIC_ADMIN_KEY,
    model: 'claude-haiku-4-5-20251001',
    endpoints: [
      { path: '/api/analyze', purpose: 'YouTube 분석 → Suno 프롬프트 생성' },
      { path: '/api/yt-analyze', purpose: 'YouTube URL 분석' },
    ],
    pricing: {
      model: 'claude-haiku-4-5-20251001',
      input_per_1m: 0.80,
      output_per_1m: 4.00,
      currency: 'USD',
    },
  };

  // Anthropic API로 사용량 조회 시도
  const key = ANTHROPIC_ADMIN_KEY || ANTHROPIC_API_KEY;
  if (key) {
    try {
      // 1. API key 유효성 + 모델 접근 테스트
      const testR = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      const testD = await testR.json();
      if (testR.ok && testD.usage) {
        result.apiStatus = 'active';
        result.testUsage = testD.usage; // { input_tokens, output_tokens }
      } else if (testD.error) {
        result.apiStatus = 'error';
        result.apiError = testD.error.message || testD.error.type || 'unknown';
      }
    } catch (e) {
      result.apiStatus = 'error';
      result.apiError = e.message;
    }

    // 2. 조직 사용량 조회 (Admin API key 필요)
    if (ANTHROPIC_ADMIN_KEY) {
      try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const today = now.toISOString().slice(0, 10);

        const usageR = await fetch(`https://api.anthropic.com/v1/organizations/usage?start_date=${monthStart}&end_date=${today}`, {
          headers: {
            'x-api-key': ANTHROPIC_ADMIN_KEY,
            'anthropic-version': '2023-06-01',
          },
        });
        if (usageR.ok) {
          result.orgUsage = await usageR.json();
        }
      } catch {}
    }
  } else {
    result.apiStatus = 'no_key';
  }

  return res.status(200).json(result);
}
