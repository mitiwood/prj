/**
 * yt-analyze — v1: 개선 버전 (Improvement)
 *
 * 수정사항:
 * 1. oEmbed + noembed 병렬 fetch → Promise.allSettled() 사용 (~300ms 단축)
 * 2. max_tokens 1024 → 2048 (Claude 분석 품질 향상)
 * 3. encodedUrl 변수 추출 → 중복 encodeURIComponent 제거
 * 4. 조건문 간결화 → 가독성 향상
 */

/**
 * Step 1-a + 1-b: 메타데이터 병렬 수집
 * 기존 순차 fetch를 Promise.allSettled()로 병렬화
 *
 * @param {string} url - YouTube URL
 * @returns {{ title: string, author: string }}
 */
export async function fetchOembedMeta(url) {
  const encodedUrl = encodeURIComponent(url);

  const [oembedResult, noembedResult] = await Promise.allSettled([
    fetch(`https://www.youtube.com/oembed?url=${encodedUrl}&format=json`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }).then(r => r.ok ? r.json() : null).catch(() => null),

    fetch(`https://noembed.com/embed?url=${encodedUrl}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);

  const oembedData  = oembedResult.status  === 'fulfilled' ? oembedResult.value  : null;
  const noembedData = noembedResult.status === 'fulfilled' ? noembedResult.value : null;

  let title  = '';
  let author = '';

  if (oembedData) {
    title  = oembedData.title       || '';
    author = oembedData.author_name || '';
  }
  if (noembedData) {
    if (!title  && noembedData.title)       title  = noembedData.title;
    if (!author && noembedData.author_name) author = noembedData.author_name;
  }

  return { title, author };
}

/**
 * Step 2-b: Claude Haiku 폴백 분석
 * max_tokens: 1024 → 2048 (복잡한 JSON 구조 완전 출력 보장)
 *
 * @param {string} anthropicKey
 * @param {string} analysisPrompt
 * @returns {Promise<object|null>}
 */
export async function callClaudeHaiku(anthropicKey, analysisPrompt) {
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
        max_tokens: 2048,  // 1024 → 2048: 분석 JSON 잘림 방지
        messages: [{ role: 'user', content: analysisPrompt }],
      }),
    });
    const cd = await cr.json();
    if (cd.error) return null;
    return cd.content?.find(c => c.type === 'text')?.text || null;
  } catch {
    return null;
  }
}

// ── 적용 예시 (api/yt-analyze.js Step 1 교체 코드) ──
//
//   const { title, author } = await fetchOembedMeta(url);
//
// ── Step 2-b Claude 호출 교체 코드 ──
//
//   const text = await callClaudeHaiku(anthropicKey, analysisPrompt);
//   if (text) { analysis = _parseJsonResponse(text); if (analysis) _analyzer = 'claude-haiku'; }
