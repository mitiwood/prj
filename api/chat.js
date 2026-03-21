/**
 * /api/chat — 커뮤니티 채팅 API
 *
 * GET  ?room=general&limit=50&since=timestamp → 메시지 조회
 * POST body: {room, content, author_name, author_avatar, author_provider} → 메시지 전송
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

const _rateMap = {};
function _checkRate(key, max, windowMs = 30000) {
  const now = Date.now();
  if (!_rateMap[key]) _rateMap[key] = [];
  _rateMap[key] = _rateMap[key].filter(t => now - t < windowMs);
  if (_rateMap[key].length >= max) return false;
  _rateMap[key].push(now);
  return true;
}

let _mem = [];

async function sb(method, path, body = null) {
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: method === 'GET' ? 'count=exact' : 'return=representation',
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1${path}`, opts);
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { return txt; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* GET — 메시지 조회 */
  if (req.method === 'GET') {
    const { room = 'general', limit = '50', since } = req.query || {};
    const lim = Math.min(parseInt(limit) || 50, 100);
    if (SB_URL && SB_KEY) {
      try {
        let path = `/chat_messages?room=eq.${room}&order=created_at.desc&limit=${lim}`;
        if (since) path += `&created_at=gt.${new Date(parseInt(since)).toISOString()}`;
        const data = await sb('GET', path);
        return res.status(200).json({ ok: true, messages: Array.isArray(data) ? data.reverse() : [] });
      } catch (e) {
        return res.status(200).json({ ok: true, messages: _mem.filter(m => m.room === room).slice(-lim) });
      }
    }
    return res.status(200).json({ ok: true, messages: _mem.filter(m => m.room === room).slice(-lim) });
  }

  /* POST — 메시지 전송 */
  if (req.method === 'POST') {
    const { room = 'general', content, author_name, author_avatar = '', author_provider = '' } = req.body || {};
    if (!content || !author_name) return res.status(400).json({ error: 'content and author_name required' });
    if (content.length > 500) return res.status(400).json({ error: 'message too long (max 500)' });
    if (author_provider === 'guest') return res.status(401).json({ error: 'login required' });

    const rateKey = `chat_${author_name}_${author_provider}`;
    if (!_checkRate(rateKey, 5)) return res.status(429).json({ error: '메시지를 너무 빠르게 보내고 있어요' });

    const msg = { room, author_name, author_avatar, author_provider, content: content.slice(0, 500), created_at: new Date().toISOString() };

    if (SB_URL && SB_KEY) {
      try {
        const data = await sb('POST', '/chat_messages', msg);
        return res.status(200).json({ ok: true, message: Array.isArray(data) ? data[0] : data });
      } catch (e) {
        _mem.push({ ...msg, id: Date.now() });
        if (_mem.length > 500) _mem = _mem.slice(-500);
        return res.status(200).json({ ok: true, message: msg, source: 'memory' });
      }
    }
    _mem.push({ ...msg, id: Date.now() });
    if (_mem.length > 500) _mem = _mem.slice(-500);
    return res.status(200).json({ ok: true, message: msg, source: 'memory' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
