/**
 * /api/my-feed — 나만의 피드: 팔로우한 아티스트의 트랙 조회
 *
 * GET ?name=xxx&provider=yyy → 팔로우한 아티스트들의 공개 트랙 목록
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sb(method, path) {
  if (!SB_URL || !SB_KEY) throw new Error('Supabase 미설정');
  const headers = {
    apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'count=exact',
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`${SB_URL}/rest/v1${path}`, { method, headers, signal: controller.signal });
    clearTimeout(timeout);
    const txt = await r.text();
    if (!r.ok) throw new Error(`SB ${r.status}: ${txt.slice(0, 100)}`);
    return { data: txt ? JSON.parse(txt) : [] };
  } catch (e) { clearTimeout(timeout); throw e; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const name = req.query?.name;
  const provider = req.query?.provider;
  if (!name || !provider) return res.status(400).json({ error: 'name, provider 필요' });

  try {
    /* 1) 내가 팔로우하는 사람 목록 */
    const { data: follows } = await sb('GET',
      `/follows?follower_name=ilike.${encodeURIComponent(name)}&follower_provider=eq.${encodeURIComponent(provider)}&select=following_name,following_provider&limit=100`);

    if (!follows || !follows.length) {
      return res.status(200).json({ ok: true, tracks: [], artists: [] });
    }

    /* 2) 각 아티스트의 공개 트랙 가져오기 (최대 10곡씩) */
    const allTracks = [];
    const artists = [];
    const seen = new Set();

    for (const f of follows) {
      const key = `${f.following_name}::${f.following_provider}`;
      if (seen.has(key)) continue;
      seen.add(key);

      try {
        const { data: tracks } = await sb('GET',
          `/tracks?owner_name=ilike.${encodeURIComponent(f.following_name)}&owner_provider=ilike.${encodeURIComponent(f.following_provider)}&audio_url=neq.&audio_url=not.is.null&order=created_at.desc&select=id,title,audio_url,image_url,video_url,tags,comm_likes,comm_plays,owner_name,owner_provider,created_at&limit=10`);

        if (tracks?.length) {
          artists.push({ name: f.following_name, provider: f.following_provider, trackCount: tracks.length });
          tracks.forEach(t => allTracks.push(t));
        }
      } catch (e) {
        console.warn(`[my-feed] ${f.following_name} tracks error:`, e.message);
      }
    }

    /* 3) 최신순 정렬 */
    allTracks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.status(200).json({
      ok: true,
      tracks: allTracks.slice(0, 100),
      artists,
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message, tracks: [], artists: [] });
  }
}
