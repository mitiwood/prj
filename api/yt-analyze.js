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
    const prompt = `You are a professional music producer. Analyze this YouTube video and create a detailed music production specification to recreate a VERY SIMILAR sounding track.

Video title: "${title}"
Channel: "${author}"

IMPORTANT: Analyze the likely musical characteristics based on the title/artist. Be SPECIFIC about:
- Exact sub-genre (not just "Pop" but "K-Pop Dance Pop with synth hooks")
- Specific instruments and production techniques
- Vocal style and arrangement
- Song structure and tempo

Answer in JSON ONLY (no other text):
{
  "genre": "specific sub-genre in English (e.g., 'K-Pop Dance Pop', 'Acoustic Indie Folk', 'Trap Hip-Hop')",
  "mood": "primary mood in English (e.g., 'energetic', 'melancholic', 'dreamy')",
  "style_prompt": "detailed Suno style tags, comma-separated, 30-50 words, NO artist names. Include: genre, sub-genre, tempo feel, instruments, vocal style, production style, arrangement details",
  "description": "한국어 한 줄 분석 (30자 이내)",
  "bpm_estimate": 120,
  "mood_tags": "5-8 English mood/style tags, comma-separated",
  "vocal_gender": "m or f (guess from title/artist)",
  "lyrics_theme": "한국어로 이 노래의 가사 주제/테마 설명 (50자 이내, 예: '이별 후 그리움과 재회에 대한 희망')"
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
      style_prompt: `${cleanTitle} style, melodic, emotional vocal, polished pop production, catchy hooks, modern arrangement`,
      description:  `${cleanTitle} 스타일의 음악`,
      bpm_estimate: 120,
      mood_tags:    'uplifting, melodic, emotional, polished',
      vocal_gender: '',
      lyrics_theme: `${cleanTitle} 주제의 감성적인 노래`,
    };
  }

  return res.status(200).json({
    title,
    author,
    ...analysis,
  });
}
