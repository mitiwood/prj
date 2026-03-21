/**
 * /api/playlist — 플레이리스트 공유
 * GET ?id=xxx → 플레이리스트 곡 목록 반환
 * POST { name, tracks: [{id,title,audio_url,image_url}] } → 플레이리스트 생성
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sb(method, path, body = null) {
  if (!SB_URL || !SB_KEY) throw new Error('Supabase 미설정');
  const opts = { method, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: method === 'GET' ? '' : 'return=representation' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1${path}`, opts);
  const txt = await r.text();
  if (!r.ok) throw new Error(`SB ${r.status}`);
  return txt ? JSON.parse(txt) : [];
}

/* 인메모리 폴백 */
let _mem = [];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { name, tracks, ownerName, ownerProvider } = req.body || {};
    if (!name || !tracks?.length) return res.status(400).json({ error: 'name and tracks required' });
    const id = 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const entry = { id, name, tracks: JSON.stringify(tracks.slice(0, 20)), owner_name: ownerName || '', owner_provider: ownerProvider || '', created_at: new Date().toISOString() };
    try {
      await sb('POST', '/playlists', entry);
    } catch {
      _mem.push(entry);
      if (_mem.length > 100) _mem = _mem.slice(-100);
    }
    const shareUrl = `https://ai-music-studio-bice.vercel.app/?playlist=${id}`;
    return res.status(200).json({ ok: true, id, shareUrl });
  }

  if (req.method === 'GET') {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      const data = await sb('GET', `/playlists?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
      if (data?.length) {
        const pl = data[0];
        pl.tracks = typeof pl.tracks === 'string' ? JSON.parse(pl.tracks) : pl.tracks;
        return res.status(200).json({ ok: true, playlist: pl });
      }
    } catch {}
    const mem = _mem.find(p => p.id === id);
    if (mem) {
      mem.tracks = typeof mem.tracks === 'string' ? JSON.parse(mem.tracks) : mem.tracks;
      return res.status(200).json({ ok: true, playlist: mem, source: 'memory' });
    }
    return res.status(404).json({ ok: false, error: '플레이리스트를 찾을 수 없어요' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
