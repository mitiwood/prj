/**
 * /api/chat — 커뮤니티 채팅 API
 *
 * GET  ?room=general&limit=50&since=timestamp → 메시지 조회 + 인사이트
 * POST body: {room, content, author_name, author_avatar, author_provider, reply_to?} → 메시지 전송
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

/* 온라인 유저 트래킹 (5분 윈도우) */
const _onlineUsers = {};
function _trackOnline(name, provider) {
  if (!name) return;
  _onlineUsers[`${name}_${provider}`] = { name, provider, ts: Date.now() };
}
function _getOnlineCount() {
  const cutoff = Date.now() - 5 * 60 * 1000;
  return Object.values(_onlineUsers).filter(u => u.ts > cutoff).length;
}
function _getOnlineList() {
  const cutoff = Date.now() - 5 * 60 * 1000;
  return Object.values(_onlineUsers).filter(u => u.ts > cutoff).map(u => u.name);
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
  const count = r.headers.get('content-range')?.match(/\/(\d+)/)?.[1];
  try { return { data: JSON.parse(txt), count: count ? parseInt(count) : null }; } catch { return { data: txt, count: null }; }
}

function _buildInsight(messages) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayMsgs = messages.filter(m => m.created_at >= todayStart);
  const authors = new Set(todayMsgs.map(m => m.author_name));
  /* 최근 1시간 내 활발한 유저 top 3 */
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentMsgs = messages.filter(m => m.created_at >= hourAgo);
  const authorCounts = {};
  recentMsgs.forEach(m => { authorCounts[m.author_name] = (authorCounts[m.author_name] || 0) + 1; });
  const topChatters = Object.entries(authorCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => ({ name, count }));

  return {
    todayMessages: todayMsgs.length,
    todayParticipants: authors.size,
    topChatters,
    onlineCount: _getOnlineCount(),
    onlineUsers: _getOnlineList().slice(0, 10),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* GET — 메시지 조회 + 인사이트 */
  if (req.method === 'GET') {
    const { room = 'general', limit = '50', since, user, provider } = req.query || {};
    const lim = Math.min(parseInt(limit) || 50, 100);

    /* 온라인 트래킹 */
    if (user) _trackOnline(user, provider || '');

    if (SB_URL && SB_KEY) {
      try {
        let path = `/chat_messages?room=eq.${room}&order=created_at.desc&limit=${lim}`;
        if (since) path += `&created_at=gt.${new Date(parseInt(since)).toISOString()}`;
        const { data } = await sb('GET', path);
        const msgs = Array.isArray(data) ? data.reverse() : [];

        /* 인사이트용 오늘 메시지 별도 조회 (since 없이) */
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        let allToday = msgs;
        if (since) {
          try {
            const { data: td } = await sb('GET', `/chat_messages?room=eq.${room}&created_at=gte.${todayStart.toISOString()}&order=created_at.desc&limit=200`);
            allToday = Array.isArray(td) ? td : [];
          } catch {}
        }

        return res.status(200).json({ ok: true, messages: msgs, insight: _buildInsight(allToday) });
      } catch (e) {
        const msgs = _mem.filter(m => m.room === room).slice(-lim);
        return res.status(200).json({ ok: true, messages: msgs, insight: _buildInsight(msgs) });
      }
    }
    const msgs = _mem.filter(m => m.room === room).slice(-lim);
    return res.status(200).json({ ok: true, messages: msgs, insight: _buildInsight(msgs) });
  }

  /* POST — 메시지 전송 */
  if (req.method === 'POST') {
    const { room = 'general', content, author_name, author_avatar = '', author_provider = '', reply_to = null } = req.body || {};
    if (!content || !author_name) return res.status(400).json({ error: 'content and author_name required' });
    if (content.length > 500) return res.status(400).json({ error: 'message too long (max 500)' });
    if (author_provider === 'guest') return res.status(401).json({ error: 'login required' });

    const rateKey = `chat_${author_name}_${author_provider}`;
    if (!_checkRate(rateKey, 5)) return res.status(429).json({ error: '메시지를 너무 빠르게 보내고 있어요' });

    /* 온라인 트래킹 */
    _trackOnline(author_name, author_provider);

    const msg = {
      room, author_name, author_avatar, author_provider,
      content: content.slice(0, 500),
      reply_to: reply_to ? JSON.stringify(reply_to) : null,
      created_at: new Date().toISOString(),
    };

    if (SB_URL && SB_KEY) {
      try {
        const { data } = await sb('POST', '/chat_messages', msg);
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
