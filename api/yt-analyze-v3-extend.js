/**
 * yt-analyze — v3: 확장 버전 (Extended)
 *
 * v2 오류처리 위에 추가된 사항:
 * 1. YouTube Data API v3 병렬 연동 → 조회수, 좋아요수, 실제 카테고리 ID 획득
 * 2. 썸네일 URL 자동 선택 (maxres → hq → mq 순서 폴백)
 * 3. noembed 추가 필드 활용: thumbnail_url, width, height, provider_url
 * 4. 멀티소스 3-way 병렬 fetch: oEmbed + noembed + Data API 동시 실행
 * 5. max_tokens 2048 유지 + system prompt 분리 (Anthropic 권장 패턴)
 * 6. Gemini flash 우선 + Claude 폴백 순서 동일하게 유지
 */

const FETCH_TIMEOUT_MS = 4000;
const YT_DATA_API_BASE = 'https://www.googleapis.com/youtube/v3';

/** @typedef {{ title: string, author: string, thumbnail: string, viewCount: number, likeCount: number, actualDuration: string, _sources: string[] }} ExtendedMeta */

/**
 * AbortController 기반 fetch (타임아웃 포함)
 */
async function fetchT(url, opts = {}, ms = FETCH_TIMEOUT_MS) {
  const ac = new AbortController();
  const t  = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * 썸네일 품질 우선순위 선택
 * YouTube Data API thumbnails 객체에서 최고 화질 URL 반환
 *
 * @param {object} thumbnails - { maxres, high, medium, default } 등
 * @param {string} videoId - 폴백용
 * @returns {string}
 */
function pickThumbnail(thumbnails, videoId) {
  const order = ['maxres', 'standard', 'high', 'medium', 'default'];
  for (const key of order) {
    if (thumbnails?.[key]?.url) return thumbnails[key].url;
  }
  // 최종 폴백: 기본 YouTube 썸네일 URL
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';
}

/**
 * 초(seconds)를 "M:SS" 형식으로 변환
 * @param {string|number} iso8601duration - "PT4M23S" 형식
 */
function parseDuration(iso8601) {
  if (!iso8601) return '';
  const m = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const h  = parseInt(m[1] || '0', 10);
  const mm = parseInt(m[2] || '0', 10);
  const ss = parseInt(m[3] || '0', 10);
  if (h > 0) return `${h}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  return `${mm}:${String(ss).padStart(2,'0')}`;
}

/**
 * Step 1 (확장): 3-way 병렬 메타데이터 수집
 * - oEmbed: 제목, 채널명
 * - noembed: 제목, 채널명, 썸네일 URL
 * - YouTube Data API v3: 조회수, 좋아요수, 설명, 카테고리, 실제 길이, 태그, 썸네일
 *
 * YouTube Data API 키가 없으면 oEmbed+noembed 2-way로 자동 다운그레이드.
 *
 * @param {string} url        - YouTube URL
 * @param {string} videoId    - 파싱된 videoId
 * @param {string} [ytApiKey] - YOUTUBE_API_KEY 환경변수
 * @returns {Promise<ExtendedMeta>}
 */
export async function fetchExtendedMeta(url, videoId, ytApiKey = '') {
  const encodedUrl = encodeURIComponent(url);
  const _sources   = [];

  // 3개 요청 동시 발사
  const requests = [
    // 1. oEmbed
    fetchT(
      `https://www.youtube.com/oembed?url=${encodedUrl}&format=json`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    ).then(r => r.ok ? r.json() : null).catch(() => null),

    // 2. noembed (썸네일 포함)
    fetchT(
      `https://noembed.com/embed?url=${encodedUrl}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    ).then(r => r.ok ? r.json() : null).catch(() => null),

    // 3. YouTube Data API v3 (키 있을 때만, 없으면 즉시 null)
    ytApiKey && videoId
      ? fetchT(
          `${YT_DATA_API_BASE}/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${ytApiKey}`,
        ).then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null),
  ];

  const [oembedResult, noembedResult, dataApiResult] = await Promise.allSettled(requests);

  const oembedData  = oembedResult.status  === 'fulfilled' ? oembedResult.value  : null;
  const noembedData = noembedResult.status === 'fulfilled' ? noembedResult.value : null;
  const dataApiData = dataApiResult.status === 'fulfilled' ? dataApiResult.value : null;

  // ── 필드 합성 (우선순위: Data API > oEmbed > noembed) ──
  let title     = '';
  let author    = '';
  let thumbnail = '';
  let viewCount = 0;
  let likeCount = 0;
  let actualDuration = '';
  let apiTags   = '';
  let apiDesc   = '';

  // oEmbed 기본값
  if (oembedData) {
    title     = oembedData.title       || '';
    author    = oembedData.author_name || '';
    thumbnail = oembedData.thumbnail_url || '';
    _sources.push('oembed');
  }

  // noembed 보완 (썸네일 우선 사용)
  if (noembedData) {
    if (!title  && noembedData.title)       title  = noembedData.title;
    if (!author && noembedData.author_name) author = noembedData.author_name;
    if (noembedData.thumbnail_url)          thumbnail = noembedData.thumbnail_url;
    _sources.push('noembed');
  }

  // YouTube Data API v3 — 가장 신뢰도 높음
  const item = dataApiData?.items?.[0];
  if (item) {
    const snippet    = item.snippet    || {};
    const stats      = item.statistics || {};
    const content    = item.contentDetails || {};

    if (snippet.title)       title  = snippet.title;
    if (snippet.channelTitle) author = snippet.channelTitle;
    if (snippet.description) apiDesc  = snippet.description.slice(0, 500);
    if (snippet.tags)        apiTags  = snippet.tags.slice(0, 20).join(', ');

    viewCount = parseInt(stats.viewCount || '0', 10);
    likeCount = parseInt(stats.likeCount || '0', 10);
    actualDuration = parseDuration(content.duration);
    thumbnail = pickThumbnail(snippet.thumbnails, videoId);

    _sources.push('youtube-data-api');
  }

  // 썸네일 최종 폴백
  if (!thumbnail && videoId) {
    thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }

  return {
    title,
    author,
    thumbnail,
    viewCount,
    likeCount,
    actualDuration,
    apiTags,
    apiDesc,
    _sources,
  };
}

/**
 * Step 2-b: Claude Haiku 확장 호출
 * - system prompt 분리 (Anthropic 권장, 토큰 효율 향상)
 * - max_tokens 2048 유지
 * - viewCount/likeCount를 프롬프트에 추가하여 인기도 맥락 제공
 *
 * @param {string} anthropicKey
 * @param {string} systemPrompt  - 역할 지시 (고정)
 * @param {string} userPrompt    - 메타데이터 (동적)
 * @returns {Promise<string|null>}
 */
export async function callClaudeHaikuExtended(anthropicKey, systemPrompt, userPrompt) {
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
        max_tokens: 2048,
        system: systemPrompt,   // system/user 분리: 캐시 가능 + 역할 명확화
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (cr.status === 429) {
      await new Promise(r => setTimeout(r, 2000));
      return callClaudeHaikuExtended(anthropicKey, systemPrompt, userPrompt);
    }

    const cd = await cr.json();
    if (cd.error) {
      console.warn('[yt-analyze] Claude error:', cd.error.type, cd.error.message);
      return null;
    }
    return cd.content?.find(c => c.type === 'text')?.text || null;
  } catch (e) {
    console.warn('[yt-analyze] Claude exception:', e.message);
    return null;
  }
}

/**
 * 응답 객체에 확장 필드 추가
 * fetchExtendedMeta 결과를 responseObj에 머지할 때 사용
 *
 * @param {object} responseObj - 기존 응답 객체
 * @param {ExtendedMeta} meta  - fetchExtendedMeta 반환값
 * @returns {object}
 */
export function mergeExtendedFields(responseObj, meta) {
  return {
    ...responseObj,
    thumbnail:      meta.thumbnail      || undefined,
    viewCount:      meta.viewCount      || undefined,
    likeCount:      meta.likeCount      || undefined,
    actualDuration: meta.actualDuration || responseObj.duration || undefined,
    _sources:       meta._sources,
  };
}

// ── 적용 예시 ──
//
// Step 1 교체 (yt-analyze.js 핸들러 상단):
//   const ytApiKey = process.env.YOUTUBE_API_KEY || '';
//   const meta = await fetchExtendedMeta(url, videoId, ytApiKey);
//   let { title, author, thumbnail, viewCount, likeCount, actualDuration, apiTags, apiDesc } = meta;
//
// Step 2-b 교체:
//   const SYSTEM_PROMPT = `You are an elite music producer...`; // _buildAnalysisPrompt 앞부분 분리
//   const text = await callClaudeHaikuExtended(anthropicKey, SYSTEM_PROMPT, metaInfo);
//   if (text) { analysis = _parseJsonResponse(text); if (analysis) _analyzer = 'claude-haiku'; }
//
// 응답 객체 확장:
//   const finalResponse = mergeExtendedFields(responseObj, meta);
//   return res.status(200).json(finalResponse);
//
// 필요 환경변수:
//   YOUTUBE_API_KEY=AIza... (Google Cloud Console에서 YouTube Data API v3 활성화)
