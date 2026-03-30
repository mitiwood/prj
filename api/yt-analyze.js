/**
 * /api/yt-analyze — YouTube URL 고도화 분석
 * 1. oEmbed + 페이지 메타데이터로 풍부한 정보 수집
 * 2. Claude Sonnet → Gemini Flash 폴백으로 정밀 음악 분석
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

  // ── Step 2: LLM 정밀 분석 (Gemini 무료 → Claude Haiku → 스마트 폴백) ──
  const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
  const geminiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
  let analysis = null;
  let _debugError = '';
  let _analyzer = 'fallback';

  // 수집된 메타데이터 텍스트
  const metaInfo = [
    `Video title: "${title}"`,
    `Channel/Artist: "${author}"`,
    description ? `Video description: "${description.slice(0, 400)}"` : '',
    tags ? `Video tags: "${tags}"` : '',
    category ? `Category: "${category}"` : '',
    duration ? `Duration: ${duration}` : '',
    publishDate ? `Published: ${publishDate}` : '',
  ].filter(Boolean).join('\n');

  const analysisPrompt = _buildAnalysisPrompt(metaInfo);

  // 2-a) Gemini Flash 무료 티어 (재시도 3회, 모델 폴백)
  if (geminiKey) {
    const _geminiModels = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    for (let _mi = 0; _mi < _geminiModels.length && !analysis; _mi++) {
      const _gModel = _geminiModels[_mi];
      const _geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${_gModel}:generateContent?key=${geminiKey}`;
      for (let _retry = 0; _retry < 3 && !analysis; _retry++) {
        try {
          if (_retry > 0) await new Promise(r => setTimeout(r, _retry * 5000));
          const gr = await fetch(_geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: analysisPrompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
            }),
          });
          const gd = await gr.json();
          if (gd.error) {
            const errMsg = gd.error.message || '';
            if (errMsg.includes('not found') || errMsg.includes('404')) break;
            if ((errMsg.includes('quota') || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) && _retry < 2) continue;
            _debugError += ` | ${_gModel}: ${errMsg.slice(0, 120)}`;
          } else {
            const gText = gd.candidates?.[0]?.content?.parts?.[0]?.text || '';
            analysis = _parseJsonResponse(gText);
            if (analysis) _analyzer = 'gemini';
            else _debugError += ` | ${_gModel} parse fail`;
          }
        } catch (e) { _debugError += ` | ${_gModel}: ${e.message}`; }
      }
    }
  }

  // 2-b) Claude Haiku 폴백 ($0.0045/회)
  if (!analysis && anthropicKey) {
    try {
      const cr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: analysisPrompt }],
        }),
      });
      const cd = await cr.json();
      if (cd.error) {
        _debugError += ` | Haiku: ${cd.error.type} - ${cd.error.message}`;
      } else {
        const text = cd.content?.find(c => c.type === 'text')?.text || '';
        analysis = _parseJsonResponse(text);
        if (analysis) _analyzer = 'claude-haiku';
      }
    } catch (e) { _debugError += ` | Haiku: ${e.message}`; }
  }

  // 2-c) LLM 실패 시 메타데이터 기반 스마트 분석
  if (!analysis) {
    analysis = _smartFallbackAnalysis(title, author, description, tags, category, duration);
    if (analysis) _analyzer = 'smart-fallback';
  }

  return res.status(200).json({
    title,
    author,
    description: description.slice(0, 200),
    tags,
    category,
    duration,
    videoId,
    _analyzed: _analyzer !== 'fallback',
    _analyzer,
    _debugError: _debugError || undefined,
    _keys: { gemini: !!geminiKey, claude: !!anthropicKey },
    ...analysis,
  });
}

/** LLM 분석 프롬프트 생성 */
function _buildAnalysisPrompt(metaInfo) {
  return `You are an elite music producer and audio engineer with encyclopedic knowledge of every genre, artist, and production technique. Analyze this YouTube music video and create a PRECISE music production specification.

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
  "style_prompt": "CRITICAL: This field is fed DIRECTLY into an AI music generator's 'style' parameter. Write 60-100 words of comma-separated style tags that will reproduce this song's sound as closely as possible. Format: '[exact sub-genre], [tempo BPM], [time signature], [key instruments with specific adjectives e.g. detuned supersaws / 808 sub bass / fingerpicked nylon guitar], [vocal technique e.g. breathy falsetto / belting chest voice / auto-tuned trap vocal], [production techniques e.g. heavy sidechain / lo-fi tape saturation / crisp digital mix], [arrangement e.g. build-drop / verse-prechorus-chorus], [sonic era/aesthetic e.g. 2020s polished pop / 90s lo-fi warmth]'. Be EXTREMELY specific — generic tags like 'pop' or 'upbeat' produce generic results. NO artist names.",
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
}

/** LLM 응답에서 JSON 파싱 */
function _parseJsonResponse(text) {
  try {
    // 코드 블록 제거 (```json ... ``` 또는 ``` ... ```)
    let clean = text;
    const codeBlockMatch = clean.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      clean = codeBlockMatch[1];
    } else {
      clean = clean.replace(/```json|```/g, '');
    }
    // JSON 객체만 추출 ({ ... })
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) clean = jsonMatch[0];
    clean = clean.trim();
    const parsed = JSON.parse(clean);
    if (parsed && parsed.genre && parsed.style_prompt) return parsed;
  } catch (e) {
    console.warn('[yt-analyze] JSON parse failed:', e.message, '| text:', text.slice(0, 300));
  }
  return null;
}

/** 메타데이터 기반 스마트 분석 (LLM 없이) — 고도화 v2 */
function _smartFallbackAnalysis(title, author, desc, tags, category, duration) {
  const all = `${title} ${author} ${desc} ${tags}`.toLowerCase();
  const cleanTitle = title.replace(/[\(\[\]].*/g, '').replace(/\/\s*가사.*$/i, '').trim();

  // ── 아티스트·곡명 파싱 (YouTube "- Topic" 채널 처리 포함) ──
  let artist = '', songName = cleanTitle;
  // "Artist - Topic" 채널에서 아티스트 추출
  const topicMatch = author.match(/^(.+?)\s*-\s*Topic$/i);
  if (topicMatch) artist = topicMatch[1].trim();
  // 제목에서 "Artist - Song" 파싱
  const dashMatch = cleanTitle.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    if (!artist) artist = dashMatch[1].trim();
    songName = dashMatch[2].trim();
  }
  // author 폴백
  if (!artist && author) artist = author.replace(/\s*-\s*Topic$/i, '').trim();

  // 한국어/일본어/영어 감지
  const isKorean = /[\uAC00-\uD7AF]/.test(title + author);
  const isJapanese = /[\u3040-\u309F\u30A0-\u30FF]/.test(title);
  const isEnglish = !isKorean && !isJapanese;
  const langTag = isKorean ? 'Korean' : isJapanese ? 'Japanese' : 'English';

  // ── 시대(era) 감지 ──
  let era = '';
  const yearMatch = (title + ' ' + desc).match(/((?:19|20)\d{2})/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    if (y < 1990) era = '80s';
    else if (y < 2000) era = '90s';
    else if (y < 2010) era = '2000s';
    else if (y < 2020) era = '2010s';
    else era = '2020s';
  }

  // ══════════════════════════════════════════════════════
  // ── 유명 아티스트 DB (아티스트명 → 구체적 스타일 즉시 매칭) ──
  // ══════════════════════════════════════════════════════
  const _artistDB = [
    // ── 2000s K-R&B / 소울 발라드 ──
    { names: ['brown eyes', '브라운아이즈'], genre: '2000s K-R&B Ballad', mood: 'melancholic', energy: 'low', bpm: 72, key: 'Dm', instruments: 'grand piano arpeggios, lush orchestral strings, finger bass, soft brushed drums, warm reverb pad', vocalStyle: 'male duo harmony vocal with smooth falsetto and emotional vibrato', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-chorus-outro', ref: 'early 2000s Korean R&B ballad with piano arpeggios and lush string arrangements, warm analog production', moodTags: 'melancholic, sentimental, yearning, heartfelt, bittersweet, warm, lush, romantic, tender, nostalgic, analog, smooth', lyricsTheme: '이별의 아픔과 그리움, 시간이 흘러도 잊지 못하는 사랑', lyricsStyle: '서정적 감성 표현, 은유적 이별 묘사' },
    { names: ['brown eyed soul', '브라운아이드소울'], genre: '2000s K-Soul / R&B', mood: 'warm', energy: 'medium', bpm: 85, key: 'Eb', instruments: 'rhodes piano, warm bass guitar, crisp snare, hi-hat groove, string section, brass stabs', vocalStyle: 'male group harmony with soulful ad-libs and rich falsetto', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-chorus-bridge-chorus-outro', ref: 'Korean neo-soul with Motown influence, warm analog mix, rich vocal harmonies', moodTags: 'soulful, warm, groovy, smooth, sophisticated, rich, jazzy, heartfelt, uplifting, retro, polished', lyricsTheme: '사랑의 따뜻함과 감사, 깊은 감성', lyricsStyle: '소울풀한 감성 표현' },
    { names: ['sg워너비', 'sg wanna be', 'sg wannabe'], genre: 'K-Power Ballad', mood: 'emotional', energy: 'medium', bpm: 70, key: 'Cm', instruments: 'grand piano, sweeping orchestral strings, cello solo, acoustic guitar, soft kick and snare', vocalStyle: 'powerful male trio vocal with soaring high notes and emotional belting', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-final_chorus-outro', ref: 'epic Korean power ballad with cinematic string arrangements and powerful vocal climax', moodTags: 'emotional, powerful, soaring, dramatic, heartfelt, cinematic, epic, passionate, yearning, lush', lyricsTheme: '깊은 사랑과 이별의 감정, 절절한 그리움', lyricsStyle: '감성적이고 직설적인 사랑 표현' },
    { names: ['바이브', 'vibe'], genre: 'K-R&B Ballad', mood: 'melancholic', energy: 'low', bpm: 68, key: 'Am', instruments: 'acoustic piano, soft strings, gentle bass, brushed drums, warm pad', vocalStyle: 'tender male vocal with delicate vibrato and emotional falsetto', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-chorus-bridge-chorus-outro', ref: 'tender Korean R&B ballad with intimate piano and soft string bed', moodTags: 'melancholic, tender, intimate, heartfelt, gentle, warm, emotional, bittersweet, yearning, soft', lyricsTheme: '사랑하는 사람에 대한 그리움과 애절함', lyricsStyle: '섬세한 감성 묘사' },
    { names: ['4men', '포맨'], genre: 'K-Power Ballad', mood: 'emotional', energy: 'medium', bpm: 72, key: 'Bbm', instruments: 'piano, orchestral strings, electric guitar arpeggios, bass, drums with fills', vocalStyle: 'powerful male vocal with explosive high register and emotional dynamics', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-final_chorus-outro', ref: 'dramatic Korean power ballad with explosive vocal climax and orchestral swells', moodTags: 'emotional, dramatic, powerful, passionate, soaring, intense, heartfelt, epic, yearning, expressive', lyricsTheme: '이별 후 후회와 절절한 사랑 고백', lyricsStyle: '직설적인 감정 표현, 드라마틱한 전개' },
    { names: ['먼데이키즈', 'monday kiz'], genre: 'K-Emotional Ballad', mood: 'melancholic', energy: 'low', bpm: 66, key: 'Gm', instruments: 'piano, acoustic guitar, soft strings, gentle percussion, warm bass', vocalStyle: 'emotional male vocal with breathy tone and tender high notes', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-chorus-bridge-chorus-outro', ref: 'intimate Korean emotional ballad with acoustic warmth and gentle arrangement', moodTags: 'melancholic, intimate, tender, yearning, gentle, bittersweet, emotional, warm, sincere, poignant', lyricsTheme: '이별의 아픔과 후회, 잊지 못하는 기억', lyricsStyle: '일상적 언어로 풀어낸 이별 감성' },

    // ── K-발라드 솔로 거장 ──
    { names: ['성시경'], genre: 'K-Lyrical Ballad', mood: 'warm', energy: 'low', bpm: 72, key: 'C', instruments: 'acoustic guitar fingerpicking, grand piano, soft strings, light percussion, warm bass', vocalStyle: 'warm tender male vocal with gentle vibrato and crystal clear tone', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-chorus-bridge-chorus-outro', ref: 'warm Korean lyrical ballad with acoustic guitar and tender vocal, clean transparent mix', moodTags: 'warm, tender, gentle, romantic, sincere, comforting, nostalgic, acoustic, serene, heartfelt', lyricsTheme: '따뜻한 사랑과 일상의 소소한 행복', lyricsStyle: '서정적이고 따뜻한 표현' },
    { names: ['박효신'], genre: 'K-Art Ballad', mood: 'emotional', energy: 'medium', bpm: 68, key: 'Fm', instruments: 'grand piano, lush orchestral strings, cello, oboe, soft percussion, deep bass', vocalStyle: 'virtuoso male vocal with extraordinary range, emotional belting to delicate pianissimo', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-climax_chorus-outro', ref: 'cinematic Korean art ballad with orchestral grandeur and virtuoso vocal performance', moodTags: 'emotional, dramatic, cinematic, powerful, soaring, majestic, passionate, profound, moving, transcendent', lyricsTheme: '깊은 사랑, 존재의 의미, 영혼의 감동', lyricsStyle: '문학적이고 깊이 있는 표현' },
    { names: ['김범수'], genre: 'K-Power Ballad', mood: 'emotional', energy: 'high', bpm: 75, key: 'Ebm', instruments: 'piano, full orchestra strings, electric guitar solo, powerful drums, bass', vocalStyle: 'explosive male vocal with incredible power and wide vibrato, raspy emotional delivery', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-climax-outro', ref: 'explosive Korean power ballad with full orchestral backing and raw powerful vocal', moodTags: 'powerful, explosive, passionate, dramatic, intense, emotional, raw, soaring, epic, moving', lyricsTheme: '격렬한 사랑과 이별의 고통', lyricsStyle: '강렬하고 직설적인 감정 폭발' },
    { names: ['이수', 'mc the max', 'mc더맥스', 'エムシーザマックス'], genre: 'K-Rock Ballad', mood: 'emotional', energy: 'medium', bpm: 74, key: 'Cm', instruments: 'electric guitar clean arpeggios, piano, strings, powerful drums, bass guitar', vocalStyle: 'high-pitched male vocal with piercing falsetto and emotional rock delivery', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-guitar_solo-final_chorus-outro', ref: 'Korean rock ballad with soaring guitar and piercing high-register vocal', moodTags: 'emotional, soaring, intense, passionate, piercing, dramatic, powerful, yearning, rock, climactic', lyricsTheme: '이별의 고통과 잊을 수 없는 사랑', lyricsStyle: '절절한 감정 토로' },
    { names: ['나얼', 'naul'], genre: 'K-Neo Soul Ballad', mood: 'warm', energy: 'low', bpm: 78, key: 'Db', instruments: 'rhodes piano, warm bass, soft brushed drums, subtle strings, synth pad', vocalStyle: 'silky smooth male vocal with effortless falsetto and soulful runs', vocalGender: 'm', structure: 'intro-verse-chorus-verse-chorus-bridge-chorus-outro', ref: 'Korean neo-soul ballad with warm Rhodes and silky smooth vocal, analog warmth', moodTags: 'warm, smooth, soulful, intimate, silky, dreamy, sophisticated, tender, lush, analog', lyricsTheme: '깊은 사랑과 그리움의 감성', lyricsStyle: '감성적이고 은유적인 소울 표현' },
    { names: ['임재범'], genre: 'K-Rock Power Ballad', mood: 'passionate', energy: 'high', bpm: 78, key: 'Em', instruments: 'distorted electric guitar, piano, powerful drums, bass, orchestral strings', vocalStyle: 'raspy powerful male vocal with explosive rock belting and raw emotion', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-chorus-guitar_solo-bridge-final_chorus-outro', ref: 'Korean rock power ballad with raw raspy vocal and distorted guitar, 90s rock production', moodTags: 'passionate, raw, powerful, intense, gritty, emotional, rock, explosive, dramatic, heartfelt', lyricsTheme: '격정적인 사랑과 고독, 인생의 아픔', lyricsStyle: '거칠고 직설적인 감정 표현' },

    // ── K-여성 보컬 ──
    { names: ['아이유', 'iu'], genre: 'K-Pop / Acoustic Pop', mood: 'warm', energy: 'medium', bpm: 96, key: 'G', instruments: 'acoustic guitar, piano, light strings, soft drums, ukulele, glockenspiel', vocalStyle: 'sweet clear female vocal with delicate dynamics and breathy intimacy', vocalGender: 'f', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-chorus-outro', ref: 'charming Korean acoustic pop with sweet vocal and whimsical arrangement, clean bright mix', moodTags: 'warm, sweet, charming, whimsical, bright, intimate, playful, gentle, dreamy, youthful', lyricsTheme: '사랑, 일상, 감성적 이야기', lyricsStyle: '감성적이고 문학적인 스토리텔링' },
    { names: ['태연', 'taeyeon'], genre: 'K-Pop Ballad / Pop', mood: 'emotional', energy: 'medium', bpm: 82, key: 'Ab', instruments: 'piano, synth strings, soft electronic drums, bass, ambient pad, harp', vocalStyle: 'powerful female vocal with clear tone, emotional belting and airy high notes', vocalGender: 'f', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-final_chorus-outro', ref: 'polished K-pop ballad with powerful female vocal and modern synth-orchestral production', moodTags: 'emotional, powerful, ethereal, dramatic, soaring, polished, modern, airy, cinematic, heartfelt', lyricsTheme: '사랑과 이별, 감정의 깊이', lyricsStyle: '감성적이고 시적인 표현' },
    { names: ['백예린', 'yerin baek'], genre: 'K-Indie R&B / Dream Pop', mood: 'dreamy', energy: 'low', bpm: 88, key: 'Eb', instruments: 'electric guitar with reverb, synth pad, soft drums, bass, ambient textures, rhodes', vocalStyle: 'breathy intimate female vocal with airy falsetto and subtle vibrato', vocalGender: 'f', structure: 'intro-verse-chorus-verse-chorus-bridge-chorus-outro', ref: 'dreamy Korean indie R&B with reverb-soaked guitar and intimate breathy vocal, lo-fi warmth', moodTags: 'dreamy, intimate, airy, ethereal, lo-fi, warm, indie, breathy, atmospheric, gentle', lyricsTheme: '몽환적인 사랑과 내면의 감성', lyricsStyle: '몽환적이고 자유로운 영어/한국어 혼합' },
    { names: ['헤이즈', 'heize'], genre: 'K-R&B / Urban Pop', mood: 'melancholic', energy: 'medium', bpm: 92, key: 'Am', instruments: 'lo-fi piano, trap hi-hats, 808 bass, synth pad, acoustic guitar, soft snare', vocalStyle: 'husky female vocal with emotional rap-singing and breathy delivery', vocalGender: 'f', structure: 'intro-verse-prechorus-chorus-verse-chorus-bridge-chorus-outro', ref: 'modern Korean urban R&B with lo-fi elements, trap-influenced beats and husky female vocal', moodTags: 'melancholic, urban, moody, intimate, lo-fi, bittersweet, modern, atmospheric, raw, emotional', lyricsTheme: '이별 후 감정, 도시적 외로움', lyricsStyle: '솔직하고 일상적인 감정 묘사' },
    { names: ['볼빨간사춘기', 'bol4', 'bolbbalgan4'], genre: 'K-Indie Pop', mood: 'bright', energy: 'medium', bpm: 108, key: 'C', instruments: 'acoustic guitar, bright piano, ukulele, light drums, bass, tambourine', vocalStyle: 'bright youthful female vocal with nasal charm and cheerful delivery', vocalGender: 'f', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-chorus-outro', ref: 'bright cheerful Korean indie pop with acoustic guitar and youthful charming vocal', moodTags: 'bright, cheerful, youthful, charming, playful, sweet, fresh, bouncy, warm, indie', lyricsTheme: '첫사랑, 설렘, 풋풋한 감정', lyricsStyle: '귀엽고 솔직한 감정 표현' },

    // ── K-Hip-Hop / K-R&B 현대 ──
    { names: ['crush', '크러쉬'], genre: 'K-R&B / Urban', mood: 'sensual', energy: 'medium', bpm: 95, key: 'Bbm', instruments: 'synth bass, lo-fi keys, trap hi-hats, ambient pad, vocal layers, soft 808', vocalStyle: 'smooth male R&B vocal with airy falsetto and melodic delivery', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-chorus-bridge-chorus-outro', ref: 'modern Korean R&B with smooth production, lo-fi textures and silky male vocal', moodTags: 'smooth, sensual, urban, modern, silky, atmospheric, chill, warm, groovy, laid-back', lyricsTheme: '사랑의 감정, 로맨틱한 분위기', lyricsStyle: '세련되고 로맨틱한 표현' },
    { names: ['dean', '딘'], genre: 'K-Alternative R&B', mood: 'moody', energy: 'medium', bpm: 100, key: 'Fm', instruments: 'detuned synth, glitchy percussion, deep bass, ambient texture, filtered vocal chops', vocalStyle: 'experimental male vocal with falsetto, vocal processing and fluid dynamics', vocalGender: 'm', structure: 'intro-verse-chorus-verse-chorus-bridge-outro', ref: 'experimental Korean alternative R&B with glitchy production and genre-bending sound design', moodTags: 'moody, experimental, atmospheric, dark, fluid, innovative, edgy, hypnotic, alternative, textured', lyricsTheme: '복잡한 감정과 현대적 사랑', lyricsStyle: '실험적이고 자유로운 표현' },
    { names: ['자이언티', 'zion.t', 'zion t'], genre: 'K-R&B / Neo Soul', mood: 'laid-back', energy: 'low', bpm: 88, key: 'Eb', instruments: 'vintage keys, warm bass, lo-fi drums, vinyl texture, subtle synth, guitar', vocalStyle: 'nasal distinctive male vocal with laid-back delivery and melodic charm', vocalGender: 'm', structure: 'intro-verse-chorus-verse-chorus-bridge-outro', ref: 'retro-tinged Korean neo-soul with vintage keys and distinctive nasal vocal, warm lo-fi production', moodTags: 'laid-back, retro, warm, charming, vintage, smooth, quirky, mellow, soulful, intimate', lyricsTheme: '일상의 감성, 위트 있는 사랑 이야기', lyricsStyle: '위트 있고 독특한 감성 표현' },
    { names: ['에픽하이', 'epik high'], genre: 'K-Hip-Hop / Alternative', mood: 'thoughtful', energy: 'medium', bpm: 95, key: 'Am', instruments: 'piano, acoustic guitar, lo-fi beats, strings, turntable scratches, deep bass', vocalStyle: 'introspective male rap with melodic hooks and spoken-word passages', vocalGender: 'm', structure: 'intro-verse-hook-verse-hook-bridge-hook-outro', ref: 'thoughtful Korean alternative hip-hop with poetic lyrics and genre-blending production', moodTags: 'thoughtful, introspective, poetic, alternative, deep, atmospheric, emotional, literary, hybrid, artistic', lyricsTheme: '삶의 의미, 사회 비판, 깊은 성찰', lyricsStyle: '문학적이고 철학적인 가사' },

    // ── K-Pop 아이돌 그룹 ──
    { names: ['bts', '방탄소년단', 'bangtan'], genre: 'K-Pop / Hip-Hop Pop', mood: 'energetic', energy: 'high', bpm: 120, key: 'Fm', instruments: 'synth brass, trap 808, hi-hat rolls, EDM synth, vocal chops, strings, bass drop', vocalStyle: 'dynamic male group vocal with rap verses and powerful vocal chorus', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-rap-prechorus-chorus-bridge-dance_break-final_chorus-outro', ref: 'high-energy K-pop with hip-hop elements, powerful choreography-driven arrangement, polished modern production', moodTags: 'energetic, powerful, anthemic, dynamic, youthful, inspirational, bold, fierce, polished, stadium', lyricsTheme: '자기 성장, 청춘, 꿈과 도전', lyricsStyle: '진솔한 메시지와 위트 있는 워드플레이' },
    { names: ['blackpink', '블랙핑크'], genre: 'K-Pop / EDM Pop', mood: 'fierce', energy: 'very high', bpm: 130, key: 'Cm', instruments: 'heavy 808 bass, trap hi-hats, brass stabs, synth drops, whistle synth, hard-hitting kicks', vocalStyle: 'fierce female group vocal with rap swag and powerful high notes', vocalGender: 'f', structure: 'intro-verse-prechorus-drop_chorus-verse-rap-prechorus-drop_chorus-bridge-final_chorus-outro', ref: 'fierce K-pop girl crush with heavy bass drops and EDM-trap hybrid production', moodTags: 'fierce, powerful, bold, confident, edgy, glamorous, hard-hitting, anthemic, bass-heavy, intense', lyricsTheme: '자신감, 독립, 강인한 여성상', lyricsStyle: '강렬하고 자신감 넘치는 표현' },
    { names: ['newjeans', '뉴진스'], genre: 'K-Pop / Y2K Pop', mood: 'fresh', energy: 'medium', bpm: 110, key: 'G', instruments: 'jersey club beats, soft synth, vintage samples, light 808, airy pad, pluck synth', vocalStyle: 'sweet youthful female vocal with soft delivery and catchy melodic hooks', vocalGender: 'f', structure: 'intro-verse-prechorus-chorus-verse-chorus-bridge-chorus-outro', ref: 'retro Y2K-inspired K-pop with jersey club influence, minimalist production and catchy hooks', moodTags: 'fresh, youthful, retro, catchy, minimalist, playful, trendy, breezy, nostalgic, bright', lyricsTheme: '풋풋한 사랑, 설렘, 청춘', lyricsStyle: '심플하고 캐치한 표현' },
    { names: ['aespa', '에스파'], genre: 'K-Pop / Hyperpop', mood: 'futuristic', energy: 'very high', bpm: 135, key: 'Dm', instruments: 'glitch synth, heavy bass, distorted leads, 808, industrial percussion, vocal processing', vocalStyle: 'processed female group vocal with powerful belting and electronic manipulation', vocalGender: 'f', structure: 'intro-verse-prechorus-drop-verse-prechorus-drop-bridge-breakdown-final_drop-outro', ref: 'futuristic K-pop with hyperpop elements, maximalist production and genre-bending arrangement', moodTags: 'futuristic, intense, maximalist, electronic, bold, experimental, powerful, cyberpunk, dynamic, cutting-edge', lyricsTheme: '가상세계, 정체성, 미래적 서사', lyricsStyle: '세계관 기반 스토리텔링' },
    { names: ['ive', '아이브'], genre: 'K-Pop / Teen Fresh', mood: 'confident', energy: 'high', bpm: 116, key: 'Bb', instruments: 'bright synth, punchy bass, dance beat, strings, brass, vocal chops', vocalStyle: 'confident female group vocal with bright tone and catchy hooks', vocalGender: 'f', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-final_chorus-outro', ref: 'confident K-pop with bright teen-fresh production, catchy hooks and polished arrangement', moodTags: 'confident, bright, catchy, glamorous, polished, youthful, fun, chic, energetic, anthemic', lyricsTheme: '자신감, 사랑, 긍정적 에너지', lyricsStyle: '밝고 자신감 넘치는 표현' },
    { names: ['seventeen', '세븐틴'], genre: 'K-Pop / Performance Pop', mood: 'energetic', energy: 'high', bpm: 122, key: 'Ab', instruments: 'synth, punchy drums, bass, piano, strings, EDM elements, guitar riff', vocalStyle: 'versatile male group vocal with rap line and powerful vocal line', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-rap-chorus-bridge-dance_break-final_chorus-outro', ref: 'self-produced K-pop with dynamic arrangement, balanced rap-vocal structure and performance focus', moodTags: 'energetic, dynamic, youthful, powerful, versatile, anthemic, bright, polished, fun, groovy', lyricsTheme: '청춘, 사랑, 우정, 성장', lyricsStyle: '밝고 진솔한 감성 표현' },
    { names: ['stray kids', '스트레이 키즈', '스키즈'], genre: 'K-Pop / EDM Hip-Hop', mood: 'intense', energy: 'very high', bpm: 140, key: 'Cm', instruments: 'distorted bass, heavy 808, industrial synth, aggressive drums, vocal distortion, brass', vocalStyle: 'aggressive male group vocal with intense rap and powerful belting', vocalGender: 'm', structure: 'intro-verse-buildup-drop-verse-rap-drop-bridge-breakdown-final_drop-outro', ref: 'hard-hitting K-pop with EDM drops, aggressive hip-hop elements and intense performance energy', moodTags: 'intense, aggressive, powerful, hard-hitting, dark, fierce, energetic, raw, bold, explosive', lyricsTheme: '자유, 반항, 자기 정체성', lyricsStyle: '강렬하고 직설적인 메시지' },
    { names: ['exo', '엑소'], genre: 'K-Pop / R&B Pop', mood: 'smooth', energy: 'high', bpm: 112, key: 'Fm', instruments: 'synth pad, R&B bass, crisp drums, piano, strings, electronic elements', vocalStyle: 'powerful male group vocal with R&B harmonies and strong high notes', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-final_chorus-outro', ref: 'polished K-pop with R&B foundation, powerful vocal harmonies and sleek production', moodTags: 'smooth, powerful, polished, sophisticated, dynamic, romantic, sleek, groovy, anthemic, rich', lyricsTheme: '사랑, 그리움, 로맨틱한 감정', lyricsStyle: '로맨틱하고 세련된 표현' },
    { names: ['twice', '트와이스'], genre: 'K-Pop / Bright Pop', mood: 'cheerful', energy: 'high', bpm: 118, key: 'C', instruments: 'bright synth, funky bass, dance beat, brass, strings, electronic piano', vocalStyle: 'sweet cheerful female group vocal with catchy hook and bright tone', vocalGender: 'f', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-final_chorus-outro', ref: 'bright cheerful K-pop with catchy hook-driven production and sweet vocal delivery', moodTags: 'cheerful, bright, catchy, sweet, playful, energetic, fun, bubbly, youthful, danceable', lyricsTheme: '설렘, 사랑, 밝은 감정', lyricsStyle: '밝고 귀여운 감성 표현' },

    // ── K-밴드 / K-록 ──
    { names: ['넬', 'nell'], genre: 'K-Alternative Rock / Emo', mood: 'melancholic', energy: 'medium', bpm: 92, key: 'Am', instruments: 'clean electric guitar, delay guitar, bass, steady drums, ambient synth, piano', vocalStyle: 'delicate male vocal with emotional fragility and ethereal quality', vocalGender: 'm', structure: 'intro-verse-chorus-verse-chorus-bridge-chorus-outro', ref: 'atmospheric Korean alternative rock with ethereal guitars and emotionally fragile vocal', moodTags: 'melancholic, atmospheric, ethereal, fragile, dreamy, alternative, introspective, poetic, ambient, delicate', lyricsTheme: '상실, 그리움, 존재의 고독', lyricsStyle: '시적이고 은유적인 감성 표현' },
    { names: ['잔나비', 'jannabi'], genre: 'K-Retro Rock / Indie', mood: 'nostalgic', energy: 'medium', bpm: 105, key: 'D', instruments: 'vintage electric guitar, organ, bass, retro drums, tambourine, brass section', vocalStyle: 'warm retro male vocal with vintage charm and expressive dynamics', vocalGender: 'm', structure: 'intro-verse-chorus-verse-chorus-bridge-guitar_solo-chorus-outro', ref: 'Korean retro rock with 70s-80s vintage sound, warm analog production and nostalgic charm', moodTags: 'nostalgic, retro, warm, vintage, charming, romantic, groovy, organic, breezy, cheerful', lyricsTheme: '사랑, 청춘, 아름다운 순간들', lyricsStyle: '레트로 감성의 로맨틱한 표현' },
    { names: ['day6', '데이식스'], genre: 'K-Pop Rock / Band', mood: 'energetic', energy: 'high', bpm: 118, key: 'E', instruments: 'electric guitar, acoustic guitar, bass, drums, keyboard, synthesizer', vocalStyle: 'passionate male vocal with rock energy and melodic pop sensibility', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-final_chorus-outro', ref: 'Korean pop-rock band with catchy melodies, driving guitar and passionate vocal delivery', moodTags: 'energetic, passionate, catchy, driving, youthful, emotional, rock, anthemic, bright, dynamic', lyricsTheme: '사랑, 이별, 청춘의 감정', lyricsStyle: '직설적이고 감성적인 표현' },
    { names: ['10cm', '십센치'], genre: 'K-Acoustic Pop / Indie', mood: 'warm', energy: 'low', bpm: 95, key: 'G', instruments: 'acoustic guitar, light piano, soft drums, bass, subtle strings', vocalStyle: 'high-pitched distinctive male vocal with nasally charm and indie sensibility', vocalGender: 'm', structure: 'intro-verse-chorus-verse-chorus-bridge-chorus-outro', ref: 'Korean acoustic indie pop with distinctive high male vocal and warm guitar-driven arrangement', moodTags: 'warm, indie, charming, acoustic, gentle, quirky, bright, romantic, cozy, sincere', lyricsTheme: '사랑, 일상의 감성, 솔직한 고백', lyricsStyle: '위트 있고 솔직한 감성 표현' },

    // ── K-Indie / K-Folk ──
    { names: ['악동뮤지션', 'akmu', 'akdong musician'], genre: 'K-Indie Pop / Folk Pop', mood: 'bright', energy: 'medium', bpm: 112, key: 'D', instruments: 'acoustic guitar, piano, bright drums, bass, ukulele, handclaps', vocalStyle: 'bright sibling duo vocal with youthful harmony and distinctive tone', vocalGender: 'mixed', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-chorus-outro', ref: 'bright Korean indie-pop with sibling vocal harmony and folk-influenced acoustic production', moodTags: 'bright, youthful, fresh, quirky, playful, warm, indie, acoustic, charming, creative', lyricsTheme: '일상, 사랑, 독특한 시선의 이야기', lyricsStyle: '창의적이고 독특한 스토리텔링' },

    // ── K-트로트 ──
    { names: ['임영웅'], genre: 'Modern Trot / Ballad', mood: 'emotional', energy: 'medium', bpm: 80, key: 'Cm', instruments: 'piano, strings, acoustic guitar, soft drums, bass, orchestral arrangement', vocalStyle: 'warm powerful male vocal with trot vibrato and ballad emotional delivery', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-chorus-bridge-final_chorus-outro', ref: 'modern Korean trot-ballad crossover with warm powerful vocal and orchestral arrangement', moodTags: 'emotional, warm, powerful, comforting, dramatic, nostalgic, heartfelt, sincere, moving, anthemic', lyricsTheme: '사랑, 효도, 인생의 위로', lyricsStyle: '진솔하고 따뜻한 감정 표현' },
    { names: ['송가인'], genre: 'Modern Trot', mood: 'cheerful', energy: 'high', bpm: 118, key: 'G', instruments: 'synth brass, electric guitar, bass, drums, accordion, traditional percussion', vocalStyle: 'powerful female trot vocal with ornamental vibrato and dynamic range', vocalGender: 'f', structure: 'intro-verse-chorus-verse-chorus-bridge-chorus-outro', ref: 'modern Korean trot with powerful female vocal, brass arrangements and rhythmic bounce', moodTags: 'cheerful, powerful, festive, bright, dynamic, traditional, vibrant, playful, energetic, retro', lyricsTheme: '사랑, 인생, 밝은 에너지', lyricsStyle: '밝고 활기찬 트로트 감성' },

    // ── 해외 아티스트 ──
    { names: ['ed sheeran', '에드 시런'], genre: 'Acoustic Pop / Folk Pop', mood: 'warm', energy: 'medium', bpm: 96, key: 'G', instruments: 'acoustic guitar fingerpicking, loop pedal layers, light percussion, bass, strings', vocalStyle: 'warm raspy male vocal with intimate delivery and melodic storytelling', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-chorus-bridge-chorus-outro', ref: 'acoustic folk-pop with loop-based layered production and warm intimate vocal storytelling', moodTags: 'warm, intimate, acoustic, heartfelt, romantic, gentle, sincere, organic, storytelling, breezy', lyricsTheme: 'love, heartbreak, personal stories', lyricsStyle: 'narrative storytelling with poetic imagery' },
    { names: ['taylor swift', '테일러 스위프트'], genre: 'Pop / Singer-Songwriter', mood: 'emotional', energy: 'medium', bpm: 100, key: 'C', instruments: 'acoustic guitar, synth, drums, bass, piano, strings, vocal harmonies', vocalStyle: 'clear bright female vocal with narrative delivery and emotional dynamics', vocalGender: 'f', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-final_chorus-outro', ref: 'modern pop with singer-songwriter sensibility, narrative lyrics and polished production', moodTags: 'emotional, narrative, bright, empowering, nostalgic, romantic, dramatic, anthemic, personal, catchy', lyricsTheme: 'love, heartbreak, growing up, personal reflection', lyricsStyle: 'detailed narrative storytelling' },
    { names: ['the weeknd', '위켄드'], genre: 'Dark R&B / Synth Pop', mood: 'dark', energy: 'medium', bpm: 108, key: 'Fm', instruments: 'retro synth, 808 bass, electronic drums, ambient pad, vintage keys, strings', vocalStyle: 'airy falsetto male vocal with Michael Jackson influence and dark sensuality', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-chorus-bridge-chorus-outro', ref: 'dark cinematic R&B with 80s synth-pop influence, atmospheric production and falsetto vocal', moodTags: 'dark, atmospheric, cinematic, retro, sensual, moody, hypnotic, nocturnal, brooding, slick', lyricsTheme: 'dark love, nightlife, obsession, loneliness', lyricsStyle: 'dark atmospheric imagery' },
    { names: ['billie eilish', '빌리 아일리시'], genre: 'Dark Pop / Alt Pop', mood: 'dark', energy: 'low', bpm: 80, key: 'Dm', instruments: 'sub bass, minimal beats, ambient texture, whisper vocal layers, glitch elements', vocalStyle: 'whispery intimate female vocal with ASMR-like delivery and subtle power', vocalGender: 'f', structure: 'intro-verse-chorus-verse-chorus-bridge-chorus-outro', ref: 'minimalist dark pop with sub-bass heavy production, whisper vocals and bedroom-studio aesthetic', moodTags: 'dark, intimate, minimalist, haunting, whispery, moody, atmospheric, edgy, introspective, alternative', lyricsTheme: 'mental health, dark thoughts, authenticity', lyricsStyle: 'raw honest expression' },
    { names: ['adele', '아델'], genre: 'Pop Soul Ballad', mood: 'emotional', energy: 'medium', bpm: 68, key: 'Ab', instruments: 'grand piano, orchestral strings, deep bass, dramatic drums, choir', vocalStyle: 'powerful alto female vocal with extraordinary range and raw emotional delivery', vocalGender: 'f', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-final_chorus-outro', ref: 'powerful pop-soul ballad with grand piano, orchestral arrangement and devastating vocal performance', moodTags: 'emotional, powerful, dramatic, soulful, heartbreaking, raw, soaring, passionate, cinematic, devastating', lyricsTheme: 'heartbreak, loss, regret, resilience', lyricsStyle: 'deeply personal emotional storytelling' },
    { names: ['bruno mars', '브루노 마스'], genre: 'Pop Funk / Retro Pop', mood: 'groovy', energy: 'high', bpm: 115, key: 'Bb', instruments: 'funky guitar, bass slap, brass section, drums, synth, handclaps, keys', vocalStyle: 'versatile male vocal with soulful power and retro charm', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-chorus-outro', ref: 'retro-inspired pop-funk with tight grooves, brass hooks and charismatic vocal delivery', moodTags: 'groovy, funky, retro, energetic, smooth, charming, danceable, bright, fun, slick', lyricsTheme: 'love, romance, celebration', lyricsStyle: 'catchy and charming expression' },
    { names: ['ariana grande', '아리아나 그란데'], genre: 'Pop R&B / Vocal Pop', mood: 'empowering', energy: 'high', bpm: 108, key: 'Cm', instruments: 'trap drums, synth bass, piano, strings, vocal layers, 808 hi-hats', vocalStyle: 'powerful soprano female vocal with whistle register and R&B melisma', vocalGender: 'f', structure: 'intro-verse-prechorus-chorus-verse-chorus-bridge-final_chorus-outro', ref: 'modern vocal pop-R&B with trap-influenced beats and powerful soprano vocal showcase', moodTags: 'empowering, powerful, slick, modern, fierce, romantic, airy, danceable, polished, sultry', lyricsTheme: 'empowerment, love, independence', lyricsStyle: 'confident and catchy expression' },
    { names: ['maroon 5', '마룬 5'], genre: 'Pop Rock / Funk Pop', mood: 'groovy', energy: 'high', bpm: 115, key: 'Bb', instruments: 'funky guitar, bass, drums, synth, falsetto vocal hooks, whistle melody', vocalStyle: 'distinctive falsetto male vocal with pop-rock grit and melodic hooks', vocalGender: 'm', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-chorus-outro', ref: 'catchy pop-rock with funk guitar riffs, falsetto hooks and radio-friendly production', moodTags: 'groovy, catchy, energetic, fun, bright, danceable, polished, upbeat, radio-friendly, smooth', lyricsTheme: 'love, relationships, desire', lyricsStyle: 'catchy and playful pop lyrics' },
  ];

  // ── 아티스트 DB 매칭 (정확 매칭 우선) ──
  let artistMatch = null;
  const artistLower = artist.toLowerCase().trim();
  const authorLower = author.toLowerCase().replace(/\s*-\s*topic$/i, '').trim();
  for (const entry of _artistDB) {
    for (const name of entry.names) {
      if (artistLower === name || authorLower === name || artistLower.includes(name) || authorLower.includes(name)) {
        artistMatch = entry;
        break;
      }
    }
    if (artistMatch) break;
  }

  // ══════════════════════════════════════════════
  // ── 아티스트 DB 히트 → 즉시 정밀 결과 반환 ──
  // ══════════════════════════════════════════════
  if (artistMatch) {
    const a = artistMatch;
    const genderDesc = a.vocalGender === 'm' ? 'male' : a.vocalGender === 'f' ? 'female' : '';
    // 시대 보정 (era가 감지되면 프로덕션 스타일에 반영)
    const eraTag = era ? `${era} production aesthetic` : '';
    const stylePrompt = [
      a.genre, `${a.bpm} BPM`, '4/4 time signature', a.instruments,
      a.vocalStyle, `${langTag} lyrics`, `${a.mood} mood`, a.ref, eraTag,
    ].filter(Boolean).join(', ');
    return {
      genre: a.genre, mood: a.mood, energy: a.energy,
      style_prompt: stylePrompt.slice(0, 999),
      description: `${songName || cleanTitle} - ${a.genre} 스타일 분석`,
      bpm_estimate: a.bpm, key_signature: a.key || '',
      mood_tags: a.moodTags || '',
      vocal_gender: a.vocalGender, vocal_style: a.vocalStyle,
      instruments: a.instruments, song_structure: a.structure,
      reference_sound: a.ref,
      lyrics_theme: a.lyricsTheme || `${songName || cleanTitle} 관련 감성적인 노래`,
      lyrics_style: a.lyricsStyle || (isKorean ? '한국어 감성 표현' : ''),
    };
  }

  // ══════════════════════════════════════════════════════
  // ── 아티스트 미매칭 → 강화된 키워드 + 태그 기반 분석 ──
  // ══════════════════════════════════════════════════════
  const genreRules = [
    { keys: ['ballad', '발라드', '사랑', '이별', '눈물', '그리움', '보고싶', '슬픈', '아프', '미안', '잊을', '기억', '추억', '연습', '고백', '마지막', '편지', '한숨', '울다', '떠나', '아파', '사무치'], genre: 'K-Ballad', mood: 'melancholic', energy: 'low', bpm: 68, instruments: 'grand piano, orchestral strings, acoustic guitar, soft brushed drums, bass guitar, warm reverb', vocalStyle: 'emotional vocal with controlled vibrato, tender to powerful dynamics', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-chorus-outro', ref: 'emotional Korean ballad with grand piano and lush orchestral strings, warm polished mix' },
    { keys: ['hip hop', 'hip-hop', '힙합', 'rap', '랩', 'trap', '트랩', 'drill', 'boom bap', '사이퍼', 'cypher'], genre: 'K-Hip-Hop', mood: 'aggressive', energy: 'high', bpm: 140, instruments: '808 sub bass, hi-hat rolls, dark synth pads, trap snare with reverb, vocal chops, distorted bass', vocalStyle: 'rhythmic rap delivery with melodic hooks and auto-tune ad-libs', structure: 'intro-verse-hook-verse-hook-bridge-hook-outro', ref: 'modern Korean hip-hop with heavy trap beats and 808 bass, dark atmospheric mix' },
    { keys: ['rock', '록', 'band', '밴드', 'guitar solo', '기타 솔로', 'punk', '펑크', 'metal', '메탈', 'grunge'], genre: 'K-Rock', mood: 'energetic', energy: 'high', bpm: 130, instruments: 'distorted electric guitar, bass guitar, powerful drums with fills, rhythm guitar, overdrive pedal', vocalStyle: 'powerful rock vocal with grit and raw intensity', structure: 'intro-verse-chorus-verse-chorus-bridge-guitar_solo-final_chorus-outro', ref: 'Korean rock with distorted guitars, driving drums and raw powerful vocal' },
    { keys: ['edm', 'electronic', '일렉', 'dance', '댄스', 'club', '클럽', 'house', 'techno', 'trance', 'remix', 'dj', 'dubstep', 'bass drop'], genre: 'K-Pop / EDM', mood: 'euphoric', energy: 'very high', bpm: 128, instruments: 'detuned supersaws, synth lead, sub bass, sidechain compression, clap, hi-hats, white noise risers', vocalStyle: 'catchy pop vocal with auto-tune processing and vocal chops', structure: 'intro-verse-buildup-drop-verse-buildup-drop-bridge-final_drop-outro', ref: 'energetic K-pop dance track with EDM build-drop structure and festival-ready production' },
    { keys: ['r&b', 'rnb', '알앤비', 'soul', '소울', 'groovy', 'smooth', 'neo soul', '네오소울', 'urban'], genre: 'K-R&B', mood: 'sensual', energy: 'medium', bpm: 90, instruments: 'rhodes piano, smooth finger bass, crisp snare, hi-hat groove, warm synth pad, lush strings', vocalStyle: 'smooth R&B vocal with runs, falsetto and breathy passages', structure: 'intro-verse-prechorus-chorus-verse-chorus-bridge-chorus-outro', ref: 'modern Korean R&B with smooth grooves, warm Rhodes and sophisticated vocal delivery' },
    { keys: ['indie', '인디', 'folk', '포크', 'acoustic', '어쿠스틱', 'singer-songwriter', '싱어송라이터'], genre: 'K-Indie / Folk', mood: 'nostalgic', energy: 'low', bpm: 100, instruments: 'acoustic guitar fingerpicking, cajon, harmonica, light tambourine, upright bass, subtle piano', vocalStyle: 'warm breathy vocal with natural unprocessed tone and indie sensibility', structure: 'intro-verse-chorus-verse-chorus-bridge-chorus-outro', ref: 'warm Korean indie folk with fingerpicked acoustic guitar and natural intimate vocal' },
    { keys: ['trot', '트로트', '뽕짝', '뽕'], genre: 'Trot', mood: 'cheerful', energy: 'high', bpm: 120, instruments: 'synth brass, accordion, electric guitar, bass, drums, traditional percussion', vocalStyle: 'vibrato-heavy trot vocal with ornamental runs and dynamic power', structure: 'intro-verse-chorus-verse-chorus-bridge-chorus-outro', ref: 'classic Korean trot with brass arrangements, rhythmic bounce and powerful vocal delivery' },
    { keys: ['ost', 'drama', '드라마', 'soundtrack', '주제곡', 'original soundtrack'], genre: 'K-Drama OST / Ballad', mood: 'emotional', energy: 'medium', bpm: 75, instruments: 'piano, cinematic strings, cello solo, acoustic guitar, soft percussion, harp', vocalStyle: 'emotional vocal building from soft intimate to powerful climax', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-climax_chorus-outro', ref: 'cinematic Korean drama OST ballad with sweeping strings and emotional vocal arc' },
    { keys: ['lofi', 'lo-fi', '로파이', 'chill', '칠', 'study', 'relax', 'ambient'], genre: 'Lo-fi / Chill', mood: 'relaxing', energy: 'low', bpm: 85, instruments: 'lo-fi piano with tape saturation, vinyl crackle, muted drums, warm sub bass, ambient pad, jazz guitar', vocalStyle: 'soft dreamy vocal or instrumental with lo-fi processing', structure: 'intro-verse-chorus-verse-chorus-outro', ref: 'lo-fi chill beats with warm analog tape texture, vinyl noise and mellow jazzy elements' },
    // 추가 장르
    { keys: ['jazz', '재즈', 'swing', 'bebop', 'bossa nova', '보사노바'], genre: 'Jazz / Bossa Nova', mood: 'sophisticated', energy: 'low', bpm: 110, instruments: 'upright bass, brushed drums, piano, saxophone, muted trumpet, nylon guitar', vocalStyle: 'smooth jazz vocal with scatting and sophisticated phrasing', structure: 'intro-head-solo-head-solo-head-outro', ref: 'sophisticated jazz with classic instrumentation, swing feel and improvisational character' },
    { keys: ['classical', '클래식', 'orchestra', '오케스트라', 'symphony', 'concerto', 'sonata'], genre: 'Classical / Orchestral', mood: 'majestic', energy: 'medium', bpm: 80, instruments: 'full orchestra, strings section, woodwinds, brass, timpani, harp, piano', vocalStyle: 'instrumental or operatic vocal', structure: 'exposition-development-recapitulation', ref: 'classical orchestral arrangement with dynamic contrasts and rich harmonic texture' },
    { keys: ['reggae', '레게', 'reggaeton', 'dancehall', 'ska'], genre: 'Reggae / Reggaeton', mood: 'laid-back', energy: 'medium', bpm: 95, instruments: 'offbeat guitar, deep bass, reggae drums, organ, horn stabs, percussion', vocalStyle: 'relaxed vocal with rhythmic flow and patois influence', structure: 'intro-verse-chorus-verse-chorus-bridge-chorus-outro', ref: 'reggae-influenced track with offbeat guitar rhythm, deep bass and relaxed groove' },
    { keys: ['country', '컨트리', 'bluegrass', 'western', 'nashville'], genre: 'Country / Folk', mood: 'warm', energy: 'medium', bpm: 105, instruments: 'acoustic guitar, banjo, fiddle, steel guitar, bass, drums, harmonica', vocalStyle: 'warm storytelling vocal with country twang', structure: 'intro-verse-chorus-verse-chorus-bridge-chorus-outro', ref: 'country folk with acoustic instruments, storytelling vocal and warm Nashville production' },
    { keys: ['latin', '라틴', 'salsa', 'bachata', 'flamenco', 'cumbia'], genre: 'Latin Pop', mood: 'passionate', energy: 'high', bpm: 100, instruments: 'acoustic guitar, congas, bongos, brass, bass, piano, claves', vocalStyle: 'passionate vocal with Latin flair and rhythmic delivery', structure: 'intro-verse-prechorus-chorus-verse-chorus-bridge-chorus-outro', ref: 'passionate Latin pop with rhythmic percussion, brass and guitar-driven arrangement' },
  ];

  // K-Pop 기본 (아이돌/그룹곡 감지)
  const kpopKeys = ['idol', '아이돌', 'comeback', '컴백', 'mv', 'music video', 'choreography', '안무', 'teaser', 'performance', 'dance practice', 'fancam', '직캠'];

  let matched = null;
  let maxScore = 0;
  for (const rule of genreRules) {
    let score = 0;
    for (const k of rule.keys) {
      if (all.includes(k)) score += (k.length > 3 ? 2 : 1);
    }
    if (score > maxScore) { maxScore = score; matched = rule; }
  }

  // K-Pop 아이돌 감지
  if (!matched || maxScore < 2) {
    let kpopScore = 0;
    for (const k of kpopKeys) { if (all.includes(k)) kpopScore++; }
    if (kpopScore >= 1 || (category === 'Music' && isKorean && !matched)) {
      matched = { genre: 'K-Pop', mood: 'energetic', energy: 'high', bpm: 118, instruments: 'synth, punchy bass, electronic drums, keyboard, vocal chops, strings, brass stabs', vocalStyle: 'polished pop vocal with harmonies and dynamic delivery', structure: 'intro-verse-prechorus-chorus-verse-prechorus-chorus-bridge-dance_break-final_chorus-outro', ref: 'polished modern K-pop with dynamic arrangement, catchy hooks and performance-driven production' };
    }
  }

  // 매칭 실패 시 기본값
  if (!matched) {
    if (isKorean) {
      matched = { genre: 'K-Pop / Ballad', mood: 'emotional', energy: 'medium', bpm: 90, instruments: 'piano, strings, drums, bass, synth pad', vocalStyle: 'emotional Korean vocal with melodic delivery', structure: 'intro-verse-chorus-verse-chorus-bridge-chorus-outro', ref: 'Korean pop with emotional vocal delivery and polished production' };
    } else if (isJapanese) {
      matched = { genre: 'J-Pop', mood: 'uplifting', energy: 'medium', bpm: 110, instruments: 'electric guitar, bass, drums, keyboard, strings, synth', vocalStyle: 'clear Japanese vocal with melodic hooks', structure: 'intro-verse-chorus-verse-chorus-bridge-chorus-outro', ref: 'modern J-pop with clean production and melodic arrangement' };
    } else {
      matched = { genre: 'Pop', mood: 'uplifting', energy: 'medium', bpm: 110, instruments: 'synth, guitar, bass, drums, piano, vocal harmonies', vocalStyle: 'clean pop vocal with modern processing', structure: 'intro-verse-chorus-verse-chorus-bridge-chorus-outro', ref: 'contemporary pop with modern polished production' };
    }
  }

  // ── 보컬 성별 추정 (강화: 이름 + 키워드 기반) ──
  const maleNames = ['현', '준', '민', '석', '우', '진', '호', '성', '훈', '철', '영', '태', '규', '혁', '범'];
  const femaleNames = ['은', '지', '서', '연', '수', '미', '혜', '유', '린', '아', '나', '하', '윤', '희', '정'];
  const maleKeywords = ['male', 'boy', 'man', '남자', '오빠', '형'];
  const femaleKeywords = ['female', 'girl', 'woman', '여자', '언니', '누나'];
  let genderScore = 0;
  for (const c of artist) {
    if (maleNames.includes(c)) genderScore++;
    if (femaleNames.includes(c)) genderScore--;
  }
  for (const k of maleKeywords) { if (all.includes(k)) genderScore += 2; }
  for (const k of femaleKeywords) { if (all.includes(k)) genderScore -= 2; }
  const vocalGender = genderScore > 0 ? 'm' : genderScore < 0 ? 'f' : '';
  const genderDesc = vocalGender === 'm' ? 'male' : vocalGender === 'f' ? 'female' : '';

  // ── 시대 보정 (era에 따라 프로덕션 스타일 보충) ──
  const eraStyles = {
    '80s': '80s analog synth, warm tape saturation, gated reverb drums',
    '90s': '90s production, crisp digital mix, classic arrangement',
    '2000s': '2000s polished production, warm analog-digital hybrid mix',
    '2010s': '2010s modern production, compressed loud mix, electronic elements',
    '2020s': '2020s cutting-edge production, spatial audio feel, contemporary mix',
  };
  const eraTag = era ? eraStyles[era] || '' : '';

  // ── 스타일 프롬프트 조합 (고도화) ──
  const stylePrompt = [
    matched.genre,
    `${matched.bpm} BPM`,
    '4/4 time signature',
    matched.instruments,
    genderDesc ? `${genderDesc} ${matched.vocalStyle}` : matched.vocalStyle,
    `${langTag} lyrics`,
    `${matched.mood} mood`,
    matched.ref,
    eraTag,
  ].filter(Boolean).join(', ');

  // ── 무드 태그 (확장) ──
  const moodMap = {
    melancholic: 'melancholic, heartfelt, sentimental, emotional, yearning, poignant, sorrowful, bittersweet, reflective, tender, lush, acoustic',
    aggressive: 'aggressive, intense, hard-hitting, raw, powerful, gritty, bold, fierce, edgy, dynamic, dark, heavy',
    euphoric: 'euphoric, energetic, uplifting, bright, danceable, vibrant, electrifying, festival, anthem, pulsating, soaring, radiant',
    energetic: 'energetic, dynamic, catchy, vibrant, groovy, polished, upbeat, rhythmic, bright, anthemic, driving, powerful',
    sensual: 'sensual, smooth, sultry, warm, intimate, velvety, groovy, dreamy, laid-back, sophisticated, seductive, lush',
    nostalgic: 'nostalgic, warm, gentle, wistful, organic, intimate, sincere, folk, cozy, breezy, vintage, sentimental',
    emotional: 'emotional, heartfelt, powerful, dramatic, soaring, cinematic, touching, moving, expressive, lush, passionate, raw',
    relaxing: 'relaxing, chill, mellow, dreamy, ambient, lo-fi, hazy, warm, floating, peaceful, tranquil, serene',
    cheerful: 'cheerful, bouncy, festive, lively, fun, bright, retro, catchy, groovy, playful, sunny, uplifting',
    warm: 'warm, tender, gentle, comforting, sincere, acoustic, intimate, soft, romantic, soothing, mellow, heartfelt',
    dark: 'dark, moody, atmospheric, brooding, haunting, mysterious, nocturnal, cinematic, intense, shadowy, deep, hypnotic',
    fierce: 'fierce, powerful, bold, confident, aggressive, glamorous, intense, hard-hitting, anthemic, edgy, commanding, striking',
    bright: 'bright, cheerful, fresh, playful, sweet, youthful, warm, breezy, uplifting, catchy, sunny, charming',
    sophisticated: 'sophisticated, elegant, smooth, jazzy, refined, complex, classy, polished, warm, rich, layered, tasteful',
    passionate: 'passionate, fiery, intense, emotional, dramatic, powerful, raw, expressive, fervent, dynamic, hot-blooded, stirring',
    groovy: 'groovy, funky, danceable, rhythmic, bouncy, smooth, retro, tight, catchy, slick, bass-heavy, upbeat',
    laid_back: 'laid-back, mellow, relaxed, easy, smooth, chill, breezy, warm, casual, unhurried, cool, gentle',
    dreamy: 'dreamy, ethereal, atmospheric, floating, ambient, hazy, soft, whimsical, spacious, airy, delicate, surreal',
    moody: 'moody, atmospheric, dark, introspective, brooding, experimental, textured, deep, enigmatic, abstract, fluid, edgy',
    fresh: 'fresh, youthful, trendy, bright, catchy, playful, modern, breezy, minimalist, crisp, vibrant, cool',
    futuristic: 'futuristic, electronic, experimental, cutting-edge, digital, cybernetic, bold, innovative, maximalist, industrial, synthetic, otherworldly',
    confident: 'confident, bold, empowering, bright, catchy, polished, glamorous, chic, anthemic, fierce, self-assured, radiant',
    thoughtful: 'thoughtful, introspective, poetic, deep, philosophical, atmospheric, literary, ambient, reflective, meditative, artistic, contemplative',
    intense: 'intense, aggressive, powerful, dark, hard-hitting, explosive, raw, fierce, driving, relentless, heavy, visceral',
    majestic: 'majestic, grand, orchestral, sweeping, cinematic, powerful, epic, rich, soaring, dynamic, regal, dramatic',
  };

  return {
    genre: matched.genre,
    mood: matched.mood,
    energy: matched.energy,
    style_prompt: stylePrompt.slice(0, 999),
    description: `${songName || cleanTitle} - ${matched.genre} 스타일 분석`,
    bpm_estimate: matched.bpm,
    key_signature: '',
    mood_tags: moodMap[matched.mood] || moodMap.emotional,
    vocal_gender: vocalGender,
    vocal_style: (genderDesc ? genderDesc + ' ' : '') + matched.vocalStyle,
    instruments: matched.instruments,
    song_structure: matched.structure,
    reference_sound: matched.ref,
    lyrics_theme: `${songName || cleanTitle} 관련 감성적인 노래`,
    lyrics_style: isKorean ? '한국어 감성 표현' : '',
  };
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
