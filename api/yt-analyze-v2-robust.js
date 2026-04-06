/**
 * yt-analyze — v2: 오류 처리 강화 버전 (Robust Error Handling)
 *
 * v1 개선 위에 추가된 사항:
 * 1. fetch 타임아웃: AbortController로 3초 제한 (서버리스 함수 타임아웃 방지)
 * 2. 응답 유효성 검증: title/author 필드 타입 보장
 * 3. Claude 응답 상태코드 검사: 429/500/503 재시도 로직
 * 4. JSON 파싱 실패 시 상세 경고 로깅
 * 5. max_tokens 2048 + stop_sequences로 불완전 JSON 방지
 */

const FETCH_TIMEOUT_MS = 3000;

/**
 * 타임아웃 적용 fetch
 * @param {string} url
 * @param {RequestInit} opts
 * @param {number} timeoutMs
 */
async function fetchWithTimeout(url, opts = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Step 1-a + 1-b: 오류 강화 병렬 메타데이터 수집
 * - 타임아웃: 각 요청 3초
 * - 응답 타입 검증: title/author_name이 문자열인지 확인
 * - AbortError, TypeError 등 네트워크 오류 구체적으로 처리
 *
 * @param {string} url - YouTube URL
 * @returns {Promise<{ title: string, author: string, _warnings: string[] }>}
 */
export async function fetchOembedMetaRobust(url) {
  const encodedUrl = encodeURIComponent(url);
  const _warnings = [];

  const [oembedResult, noembedResult] = await Promise.allSettled([
    fetchWithTimeout(
      `https://www.youtube.com/oembed?url=${encodedUrl}&format=json`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
      FETCH_TIMEOUT_MS,
    ).then(async r => {
      if (!r.ok) {
        _warnings.push(`oEmbed HTTP ${r.status}`);
        return null;
      }
      const d = await r.json();
      // 타입 검증
      if (typeof d !== 'object' || d === null) return null;
      return {
        title:       typeof d.title       === 'string' ? d.title.trim()       : '',
        author_name: typeof d.author_name === 'string' ? d.author_name.trim() : '',
      };
    }).catch(e => {
      _warnings.push(`oEmbed fetch error: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
      return null;
    }),

    fetchWithTimeout(
      `https://noembed.com/embed?url=${encodedUrl}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
      FETCH_TIMEOUT_MS,
    ).then(async r => {
      if (!r.ok) {
        _warnings.push(`noembed HTTP ${r.status}`);
        return null;
      }
      const d = await r.json();
      if (typeof d !== 'object' || d === null) return null;
      return {
        title:       typeof d.title       === 'string' ? d.title.trim()       : '',
        author_name: typeof d.author_name === 'string' ? d.author_name.trim() : '',
      };
    }).catch(e => {
      _warnings.push(`noembed fetch error: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
      return null;
    }),
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

  return { title, author, _warnings };
}

/**
 * Step 2-b: Claude Haiku 폴백 — 재시도 + 상태코드 분기 처리
 * - 429 (Rate Limit): 2초 대기 후 1회 재시도
 * - 500/503 (서버 오류): 즉시 포기 (재시도 무의미)
 * - max_tokens 2048 + stop_sequences: JSON 잘림 방지
 *
 * @param {string} anthropicKey
 * @param {string} analysisPrompt
 * @returns {Promise<{ text: string|null, error: string }>}
 */
export async function callClaudeHaikuRobust(anthropicKey, analysisPrompt) {
  const makeRequest = async () => {
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
        stop_sequences: ['\n```', '}\n\n'],  // JSON 블록 종료 후 즉시 중단
        messages: [{ role: 'user', content: analysisPrompt }],
      }),
    });
    return cr;
  };

  try {
    let cr = await makeRequest();

    // 429 Rate Limit: 1회 재시도
    if (cr.status === 429) {
      console.warn('[yt-analyze] Claude 429 rate limit — retrying in 2s');
      await new Promise(r => setTimeout(r, 2000));
      cr = await makeRequest();
    }

    // 5xx 서버 오류: 즉시 포기
    if (cr.status >= 500) {
      return { text: null, error: `Claude HTTP ${cr.status}` };
    }

    const cd = await cr.json();
    if (cd.error) {
      return { text: null, error: `${cd.error.type}: ${cd.error.message}` };
    }

    const text = cd.content?.find(c => c.type === 'text')?.text;
    if (!text || typeof text !== 'string') {
      return { text: null, error: 'Claude empty response' };
    }

    // 응답 완결성 검증: JSON이 닫혔는지 확인
    const trimmed = text.trim();
    if (!trimmed.endsWith('}') && !trimmed.endsWith('```')) {
      console.warn('[yt-analyze] Claude response may be truncated, stop_reason:', cd.stop_reason);
    }

    return { text, error: '' };
  } catch (e) {
    return { text: null, error: e.message };
  }
}

// ── 적용 예시 ──
//
// Step 1 교체:
//   const { title, author, _warnings } = await fetchOembedMetaRobust(url);
//   if (_warnings.length) console.warn('[yt-analyze] meta warnings:', _warnings.join(' | '));
//
// Step 2-b 교체:
//   const { text, error } = await callClaudeHaikuRobust(anthropicKey, analysisPrompt);
//   if (error) _debugError += ` | Haiku: ${error}`;
//   if (text) { analysis = _parseJsonResponse(text); if (analysis) _analyzer = 'claude-haiku'; }
