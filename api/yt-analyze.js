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
  // ── 유명 아티스트 DB (외부 파일에서 로드) ──
  // ══════════════════════════════════════════════════════
  let _artistDB = [];
  try { _artistDB = require('./artist-db.js'); } catch (e) { console.warn('[yt-analyze] artist-db load fail:', e.message); }
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
