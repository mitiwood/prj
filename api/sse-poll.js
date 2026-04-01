/**
 * /api/sse-poll — Server-Sent Events 기반 실시간 생성 상태 스트리밍
 * GET ?taskId=xxx → SSE 스트림 (폴링 간격 서버 제어)
 *
 * 클라이언트의 반복 폴링 대신 서버가 상태를 push합니다.
 * Vercel 서버리스 60초 제한 내에서 동작.
 */

const KIE_BASE = 'https://api.kie.ai';
const KIE_KEY = process.env.KIE_API_KEY;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const taskId = req.query?.taskId;
  if (!taskId) return res.status(400).json({ error: 'taskId required' });

  /* SSE 헤더 */
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const MAX_POLLS = 50; /* Vercel 60초 제한 내 */
  let done = false;

  for (let i = 0; i < MAX_POLLS && !done; i++) {
    try {
      const r = await fetch(`${KIE_BASE}/api/v1/generate/record-info?taskId=${taskId}`, {
        headers: { 'Content-Type': 'application/json', 'api-key': KIE_KEY },
        signal: AbortSignal.timeout(10000),
      });
      const d = await r.json();
      const st = d?.data;
      if (!st) {
        send('status', { status: 'PENDING', progress: 0 });
      } else {
        const status = (st.status || '').toUpperCase();
        const tracks = st.response?.sunoData || st.sunoData || st.tracks || [];
        const validTracks = tracks.filter(t => {
          const url = t.audioUrl || t.audio_url || t.song_path || '';
          return url && url.length > 10 && url.startsWith('http');
        });

        /* 에러 감지 */
        const errMsg = (st.response?.errorMessage || st.errorMessage || '').toString();
        if (errMsg.includes('SENSITIVE_WORD')) {
          send('error', { message: 'SENSITIVE_WORD_ERROR' });
          done = true; break;
        }

        send('status', {
          status,
          progress: { PENDING: 5, CREATE: 10, GENERATE: 30, TEXT_SUCCESS: 60, FIRST_SUCCESS: 80, SUCCESS: 100 }[status] || 0,
          trackCount: validTracks.length,
        });

        /* 완료 조건 */
        if ((status === 'FIRST_SUCCESS' || status === 'SUCCESS' || status === 'COMPLETE') && validTracks.length) {
          send('complete', { tracks: validTracks });
          done = true; break;
        }
        if (status === 'FAIL' || status === 'FAILED' || status === 'ERROR') {
          send('error', { message: st.failMsg || st.failReason || 'Generation failed' });
          done = true; break;
        }
      }
    } catch (e) {
      send('error', { message: e.message, retryable: true });
    }

    /* 서버 측 폴링 간격: 빠르게 */
    const interval = i < 5 ? 800 : i < 15 ? 1200 : 2000;
    await new Promise(r => setTimeout(r, interval));
  }

  if (!done) send('timeout', { message: 'SSE timeout — switch to client polling' });
  res.end();
}
