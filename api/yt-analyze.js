/**
 * /api/yt-analyze — YouTube URL 완전 서버사이드 분석
 * 1. YouTube oEmbed로 제목/채널명 추출 (CORS 없음)
 * 2. Claude API로 장르/분위기/스타일 분석
 * POST { url: string }
 * → { title, author, genre, mood, style_prompt, description, bpm_estimate, lyrics? }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { url = '' } = body || {};

  if (!url || !url.includes('youtu')) {
    return res.status(400).json({ error: 'YouTube URL이 필요합니다' });
  }

  // ── Step 1: oEmbed로 제목/채널명 ──
  let title = '', author = '';
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const r = await fetch(oembedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.ok) {
      const d = await r.json();
      title  = d.title       || '';
      author = d.author_name || '';
    }
  } catch (e) {
    console.warn('[yt-analyze] oEmbed 실패:', e.message);
  }

  // oEmbed 실패 시 URL에서 videoId 추출
  if (!title) {
    const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    title  = m ? `YouTube 영상 (${m[1]})` : 'YouTube 영상';
    author = '';
  }

  // ── Step 2: Claude API로 스타일 분석 ──
  const apiKey = process.env.ANTHROPIC_API_KEY;
  let analysis = null;

  if (apiKey) {
    const prompt = `YouTube 영상 정보를 분석해서 비슷한 음악을 만들기 위한 Suno AI 프롬프트를 생성하세요.

영상 제목: "${title}"
채널명: "${author}"

JSON 형식으로만 답하세요 (다른 텍스트 없이):
{
  "genre": "장르(영어, 예: K-Pop, Lo-fi Hip-hop, EDM, Rock)",
  "mood": "분위기(영어, 예: energetic, melancholic, uplifting, chill)",
  "style_prompt": "Suno 스타일 프롬프트(영어, 콤마 구분, 15단어 이내, 아티스트명 제외)",
  "description": "한 줄 분석(한국어, 30자 이내)",
  "bpm_estimate": 120,
  "mood_tags": "분위기 태그(영어, 콤마 구분)"
}`;

    try {
      const cr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const cd   = await cr.json();
      const text = cd.content?.find(c => c.type === 'text')?.text || '';
      const clean = text.replace(/```json|```/g, '').trim();
      analysis = JSON.parse(clean);
    } catch (e) {
      console.warn('[yt-analyze] Claude 분석 실패:', e.message);
    }
  }

  // 분석 실패 시 제목 기반 폴백
  if (!analysis) {
    const cleanTitle = title.replace(/[\(\[\]].*/g, '').trim();
    analysis = {
      genre:        'Pop',
      mood:         'uplifting',
      style_prompt: `${cleanTitle} style, melodic, emotional`,
      description:  `${cleanTitle} 스타일의 음악`,
      bpm_estimate: 120,
      mood_tags:    'uplifting, melodic',
    };
  }

  return res.status(200).json({
    title,
    author,
    ...analysis,
  });
}
