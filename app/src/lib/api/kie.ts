import { API_BASE, sleep, fetchJson } from './base';

const RETRY_CODES = [429, 502, 503, 504];
const MAX_RETRIES = 3;

interface KieResponse {
  code?: number;
  data?: { taskId?: string; [k: string]: unknown };
  [k: string]: unknown;
}

export async function kieRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  user?: { name: string; provider: string },
): Promise<KieResponse> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetchJson<KieResponse>(`${API_BASE}/kie-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, path, body, user }),
      });
      return res;
    } catch (err: unknown) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const status = Number(lastErr.message.match(/\d{3}/)?.[0] ?? 0);
      if (RETRY_CODES.includes(status) && attempt < MAX_RETRIES - 1) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr ?? new Error('kieRequest failed');
}

interface PollStatus {
  status: string;
  progress?: number;
  eta?: number;
  result?: {
    audio_url?: string;
    video_url?: string;
    image_url?: string;
    title?: string;
    tags?: string;
    lyrics?: string;
    duration?: number;
  };
}

export async function pollResult(
  taskId: string,
  onProgress?: (p: number, status: string, eta: number) => void,
  signal?: AbortSignal,
): Promise<PollStatus> {
  const delays = [300, 300, 300, 800, 800, 800, 1500, 1500, 1500, 2000];
  const MAX_POLLS = 120;

  for (let i = 0; i < MAX_POLLS; i++) {
    if (signal?.aborted) throw new Error('Cancelled');
    const delay = delays[Math.min(i, delays.length - 1)];
    await sleep(delay);

    const res = await fetchJson<{ data?: PollStatus }>(`${API_BASE}/kie-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'GET', path: `/api/v1/music/task/${taskId}` }),
      signal,
    });

    const data = res.data;
    if (!data) continue;

    const progress = data.progress ?? Math.min((i / MAX_POLLS) * 100, 95);
    const eta = data.eta ?? 0;
    onProgress?.(progress, data.status, eta);

    if (data.status === 'completed' || data.status === 'complete') return data;
    if (data.status === 'failed' || data.status === 'error')
      throw new Error('Generation failed');
  }
  throw new Error('Polling timeout');
}
