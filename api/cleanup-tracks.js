/**
 * /api/cleanup-tracks — 재생 불가 트랙 정리
 *
 * POST  Authorization: Bearer ADMIN_SECRET
 *   body: { dryRun: true }  → 삭제 대상만 조회
 *   body: { dryRun: false } → 실제 삭제
 *
 * 삭제 대상:
 *  1) audio_url이 NULL/빈값인 트랙
 *  2) audio_url이 만료(HTTP 4xx/5xx)된 트랙 (선택적)
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PWD = process.env.ADMIN_SECRET;

async function sb(path, opts = {}) {
  if (!SB_URL || !SB_KEY) throw new Error('no_supabase');
  const r = await fetch(`${SB_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {}),
    },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`SB ${r.status}: ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}

/* URL 재생 가능 여부 (HEAD 요청) */
async function checkUrl(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${ADMIN_PWD}`) return res.status(401).json({ error: 'Unauthorized' });

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const dryRun = body.dryRun !== false; // 기본: dry run
  const checkExpired = body.checkExpired === true; // 만료 URL 체크 (느림)

  try {
    /* 1) audio_url이 NULL 또는 빈값인 트랙 */
    const noAudio = await sb('/tracks?or=(audio_url.is.null,audio_url.eq.)&select=id,title,owner_name,created_at&order=created_at.desc&limit=500');
    const targets = [...(noAudio || [])];

    /* 2) 만료 URL 체크 (선택적 — 시간 오래 걸림) */
    let expired = [];
    if (checkExpired) {
      const allTracks = await sb('/tracks?audio_url=neq.&select=id,title,audio_url,owner_name,created_at&order=created_at.desc&limit=200');
      const checks = await Promise.allSettled(
        (allTracks || []).map(async (t) => {
          const ok = await checkUrl(t.audio_url);
          return { ...t, playable: ok };
        })
      );
      expired = checks
        .filter(c => c.status === 'fulfilled' && !c.value.playable)
        .map(c => c.value);
      targets.push(...expired);
    }

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        dryRun: true,
        noAudioCount: (noAudio || []).length,
        expiredCount: expired.length,
        totalTargets: targets.length,
        targets: targets.map(t => ({ id: t.id, title: t.title, owner: t.owner_name, created: t.created_at })),
      });
    }

    /* 실제 삭제 */
    let deleted = 0;
    for (const t of targets) {
      try {
        await sb(`/tracks?id=eq.${encodeURIComponent(t.id)}`, { method: 'DELETE', prefer: 'return=minimal' });
        deleted++;
      } catch (e) {
        console.warn('[cleanup] delete failed:', t.id, e.message);
      }
    }

    return res.status(200).json({
      ok: true,
      dryRun: false,
      deleted,
      noAudioCount: (noAudio || []).length,
      expiredCount: expired.length,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
