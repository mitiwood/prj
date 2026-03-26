/**
 * /api/yt-analyze — YouTube URL 고도화 분석
 * 1. oEmbed + 페이지 메타데이터로 풍부한 정보 수집
 * 2. Claude Sonnet으로 정밀 음악 분석
 * POST { url: string }
 * → { title, author, genre, mood, style_prompt, description, bpm_estimate, ... }
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

  // videoId 추출
  const vidMatch = url.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  const videoId = vidMatch ? vidMatch[1] : '';

  // ── Step 1: 멀티소스 메타데이터 수집 ──
  let title = '', author = '', description = '', category = '', tags = '', duration = '', publishDate = '';

  // 1-a) oEmbed (기본)
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const r = await fetch(oembedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.ok) {
      const d = await r.json();
      title  = d.title       || '';
      author = d.author_name || '';
    }
  } catch (e) {
    console.warn('[yt-analyze] oEmbed:', e.message);
  }

  // 1-b) noembed.com (추가 메타데이터)
  try {
    const noembedUrl = `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
    const r2 = await fetch(noembedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r2.ok) {
      const d2 = await r2.json();
      if (!title && d2.title) title = d2.title;
      if (!author && d2.author_name) author = d2.author_name;
    }
  } catch (e) { /* noembed 실패 무시 */ }

  // 1-c) YouTube 페이지에서 메타데이터 스크래핑 (설명, 태그, 카테고리)
  if (videoId) {
    try {
      const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const pr = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        },
      });
      if (pr.ok) {
        const html = await pr.text();

        // og:description
        const descMatch = html.match(/<meta\s+(?:name|property)="og:description"\s+content="([^"]*?)"/i)
                       || html.match(/<meta\s+content="([^"]*?)"\s+(?:name|property)="og:description"/i);
        if (descMatch) description = _decodeHtml(descMatch[1]).slice(0, 500);

        // og:title (폴백)
        if (!title) {
          const titleMatch = html.match(/<meta\s+(?:name|property)="og:title"\s+content="([^"]*?)"/i);
          if (titleMatch) title = _decodeHtml(titleMatch[1]);
        }

        // keywords (음악 태그)
        const kwMatch = html.match(/<meta\s+name="keywords"\s+content="([^"]*?)"/i);
        if (kwMatch) tags = _decodeHtml(kwMatch[1]).slice(0, 300);

        // 카테고리 (ytInitialPlayerResponse에서)
        const catMatch = html.match(/"category"\s*:\s*"([^"]+)"/);
        if (catMatch) category = catMatch[1];

        // 길이 (lengthSeconds)
        const durMatch = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
        if (durMatch) {
          const sec = parseInt(durMatch[1], 10);
          const m = Math.floor(sec / 60);
          const s = sec % 60;
          duration = `${m}:${s.toString().padStart(2, '0')}`;
        }

        // 게시일
        const dateMatch = html.match(/"publishDate"\s*:\s*"([^"]+)"/);
        if (dateMatch) publishDate = dateMatch[1];
      }
    } catch (e) {
      console.warn('[yt-analyze] page scrape:', e.message);
    }
  }

  // 폴백: 제목 없으면 videoId로 대체
  if (!title) {
    title = videoId ? `YouTube 영상 (${videoId})` : 'YouTube 영상';
  }

  // ── Step 2: Claude Sonnet으로 정밀 분석 ──
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
  let analysis = null;
  let _debugError = '';
  const _keyPrefix = apiKey ? apiKey.slice(0, 12) + '...' : 'NONE';
  console.log('[yt-analyze] key:', _keyPrefix, '| title:', title, '| author:', author);

  if (apiKey) {
    // 수집된 모든 메타데이터를 Claude에 전달
    const metaInfo = [
      `Video title: "${title}"`,
      `Channel/Artist: "${author}"`,
      description ? `Video description: "${description.slice(0, 400)}"` : '',
      tags ? `Video tags: "${tags}"` : '',
      category ? `Category: "${category}"` : '',
      duration ? `Duration: ${duration}` : '',
      publishDate ? `Published: ${publishDate}` : '',
    ].filter(Boolean).join('\n');

    const prompt = `You are an elite music producer and audio engineer with encyclopedic knowledge of every genre, artist, and production technique. Analyze this YouTube music video and create a PRECISE music production specification.

${metaInfo}

CRITICAL INSTRUCTIONS:
1. FIRST, parse the title to identify the ARTIST and SONG NAME separately. Titles often follow patterns like "Artist - Song", "(Year) Artist - Song [info]", etc.
2. If you recognize the artist/song, use your EXACT knowledge of the track's production — the actual BPM, key, instrumentation, and arrangement.
3. If unknown, analyze ALL available metadata (title, description, tags, channel) for clues.
4. BPM must be PRECISE — for well-known songs, use the verified BPM. Do NOT default to 120.
5. style_prompt is the MOST IMPORTANT field — it directly controls AI music generation.
   Make it extremely specific with production details that capture the song's unique sound.
6. Think about what makes this specific song DIFFERENT from other songs in the same genre.

Answer in JSON ONLY:
{
  "genre": "precise sub-genre (e.g., 'Future Bass / Melodic EDM', 'Lo-fi Hip-Hop / Chillhop', '90s Boom Bap Hip-Hop')",
  "mood": "primary mood (e.g., 'euphoric', 'melancholic', 'aggressive')",
  "energy": "low / medium / high / very high",
  "style_prompt": "DETAILED Suno-compatible style tags (50-80 words). Include: exact sub-genre, tempo descriptor, key instruments (e.g., 'detuned supersaws', '808 sub bass', 'fingerpicked acoustic guitar'), vocal style (e.g., 'breathy female vocal', 'raspy male rap'), production techniques (e.g., 'heavy sidechain compression', 'lo-fi tape saturation', 'reverb-drenched'), arrangement pattern (e.g., 'build-drop structure', 'verse-chorus-bridge'), mixing style. NO artist names.",
  "description": "한국어 2줄 분석: 장르+특징 요약 (60자 이내)",
  "bpm_estimate": 128,
  "key_signature": "e.g., 'Cm', 'F#m', 'Ab' (best guess)",
  "mood_tags": "8-12 English mood/style/production tags, comma-separated",
  "vocal_gender": "m or f or mixed",
  "vocal_style": "specific vocal description (e.g., 'powerful belt with ad-libs', 'soft whisper vocal', 'auto-tuned trap vocal')",
  "instruments": "key instruments comma-separated (e.g., 'synth pad, 808 kick, hi-hat rolls, piano, strings')",
  "song_structure": "e.g., 'intro-verse-prechorus-chorus-verse-chorus-bridge-chorus-outro'",
  "reference_sound": "describe the overall sonic palette in 1 sentence (e.g., 'polished modern K-pop with retro 80s synth influences and hard-hitting 808s')",
  "lyrics_theme": "한국어로 가사의 핵심 주제/감정/스토리 (80자 이내, 구체적으로)",
  "lyrics_style": "가사 스타일 설명 (e.g., '은유적 표현 중심', '직설적 감정 표현', '스토리텔링 형식')"
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
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      let cd = await cr.json();
      /* Sonnet 실패 시 Haiku로 폴백 */
      if (cd.error) {
        console.warn('[yt-analyze] Sonnet error:', cd.error.type, cd.error.message, '→ trying Haiku');
        const cr2 = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
        });
        cd = await cr2.json();
      }
      if (cd.error) {
        console.error('[yt-analyze] Claude API error (final):', cd.error.type, cd.error.message);
      } else {
        const text = cd.content?.find(c => c.type === 'text')?.text || '';
        const clean = text.replace(/```json|```/g, '').trim();
        analysis = JSON.parse(clean);
        console.log('[yt-analyze] Claude OK:', analysis.genre, analysis.bpm_estimate);
      }
    } catch (e) {
      console.warn('[yt-analyze] Claude 분석 실패:', e.message, e.stack?.slice(0,200));
      _debugError = e.message;
    }
  }

  // 분석 실패 시 폴백
  if (!analysis) {
    const cleanTitle = title.replace(/[\(\[\]].*/g, '').trim();
    analysis = {
      genre:           'Pop',
      mood:            'uplifting',
      energy:          'medium',
      style_prompt:    `${cleanTitle} style, melodic, emotional vocal, polished pop production, catchy hooks, modern arrangement, crisp drums, layered synths`,
      description:     `${cleanTitle} 스타일의 음악`,
      bpm_estimate:    120,
      key_signature:   '',
      mood_tags:       'uplifting, melodic, emotional, polished, modern',
      vocal_gender:    '',
      vocal_style:     '',
      instruments:     '',
      song_structure:  '',
      reference_sound: '',
      lyrics_theme:    `${cleanTitle} 주제의 감성적인 노래`,
      lyrics_style:    '',
    };
  }

  return res.status(200).json({
    title,
    author,
    description: description.slice(0, 200),
    tags,
    category,
    duration,
    videoId,
    _analyzed: !!apiKey && analysis && analysis.genre !== 'Pop',
    ...analysis,
  });
}

function _decodeHtml(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}
