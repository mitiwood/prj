/**
 * /api/tracks — 생성된 트랙 서버 저장/조회
 * GET:  공개 트랙 목록 (커뮤니티용)
 * POST: 트랙 저장
 * PATCH /api/tracks?id=xxx&action=like : 좋아요 증가
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sbFetch(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase not configured');
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        options.prefer || '',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* ── GET: 공개 트랙 목록 ── */
  if (req.method === 'GET') {
    const limit  = Math.min(parseInt(req.query?.limit||'50'), 100);
    const offset = parseInt(req.query?.offset||'0');
    try {
      const tracks = await sbFetch(
        `/tracks?is_public=eq.true&order=comm_likes.desc,created_at.desc&limit=${limit}&offset=${offset}`
      );
      return res.status(200).json({ tracks, total: tracks.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  /* ── POST: 트랙 저장 ── */
  if (req.method === 'POST') {
    try {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      body = body || {};

      const { id, taskId, title, audio_url, video_url, image_url, tags, lyrics,
              genMode, owner_name, owner_avatar, owner_provider, is_public, raw_data } = body;

      if (!id || !audio_url) return res.status(400).json({ error: 'id and audio_url required' });

      const entry = {
        id, task_id: taskId||'', title: title||'무제',
        audio_url, video_url: video_url||'', image_url: image_url||'',
        tags: tags||'', lyrics: lyrics||'', gen_mode: genMode||'custom',
        owner_name: owner_name||'', owner_avatar: owner_avatar||'',
        owner_provider: owner_provider||'',
        is_public: is_public !== false,
        raw_data: raw_data || {},
      };

      await sbFetch('/tracks?on_conflict=id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates',
        body: JSON.stringify(entry),
      });
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  /* ── PATCH: 좋아요/재생수 증가 ── */
  if (req.method === 'PATCH') {
    const { id, action } = req.query || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      const col = action === 'play' ? 'comm_plays' : 'comm_likes';
      /* Supabase RPC로 atomic increment */
      const result = await sbFetch(
        `/rpc/increment_track_${col === 'comm_likes' ? 'likes' : 'plays'}`,
        { method: 'POST', body: JSON.stringify({ track_id: id }) }
      ).catch(async () => {
        /* fallback: 읽기→쓰기 */
        const [track] = await sbFetch(`/tracks?id=eq.${encodeURIComponent(id)}&select=${col}`);
        if (!track) throw new Error('track not found');
        const newVal = (track[col]||0) + 1;
        await sbFetch(`/tracks?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH', prefer: 'return=minimal',
          body: JSON.stringify({ [col]: newVal }),
        });
        return { [col]: newVal };
      });
      return res.status(200).json({ success: true, ...result });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
