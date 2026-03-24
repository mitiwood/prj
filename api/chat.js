/**
 * /api/chat — 커뮤니티 채팅 API
 *
 * GET  ?room=general&limit=50&since=timestamp → 메시지 조회 + 인사이트
 * POST body: {room, content, author_name, author_avatar, author_provider, reply_to?} → 메시지 전송
 */
import webpush from 'web-push';

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
/* 타이핑 인디케이터 (Supabase DB 기반 — serverless stateless 대응) */
async function _setTyping(name) {
  if (!name || !SB_URL || !SB_KEY) return;
  try {
    await fetch(`${SB_URL}/rest/v1/chat_typing?on_conflict=user_name`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_name: name, updated_at: new Date().toISOString() }),
    });
  } catch {}
}
async function _getTyping() {
  if (!SB_URL || !SB_KEY) return [];
  try {
    const cutoff = new Date(Date.now() - 4000).toISOString();
    const { data } = await sb('GET', `/chat_typing?updated_at=gt.${cutoff}&select=user_name`);
    return Array.isArray(data) ? data.map(r => r.user_name) : [];
  } catch { return []; }
}
/* 고정 메시지 (인메모리) */
let _pinnedMsg = null;

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

        return res.status(200).json({ ok: true, messages: msgs, insight: _buildInsight(allToday), typing: await _getTyping(), pinned: _pinnedMsg });
      } catch (e) {
        const msgs = _mem.filter(m => m.room === room).slice(-lim);
        return res.status(200).json({ ok: true, messages: msgs, insight: _buildInsight(msgs), typing: await _getTyping(), pinned: _pinnedMsg });
      }
    }
    const msgs = _mem.filter(m => m.room === room).slice(-lim);
    return res.status(200).json({ ok: true, messages: msgs, insight: _buildInsight(msgs), typing: await _getTyping(), pinned: _pinnedMsg });
  }

  /* POST — 메시지 전송 / 삭제 */
  if (req.method === 'POST') {
    const { action, msgId, room = 'general', content, author_name, author_avatar = '', author_provider = '', reply_to = null } = req.body || {};

    /* 타이핑 */
    if (action === 'typing') {
      await _setTyping(author_name);
      return res.status(200).json({ ok: true });
    }

    /* 고정 */
    if (action === 'pin' && msgId) {
      if (SB_URL && SB_KEY) {
        try {
          const { data } = await sb('GET', `/chat_messages?id=eq.${msgId}&limit=1`);
          if (Array.isArray(data) && data[0]) _pinnedMsg = data[0];
        } catch {}
      }
      return res.status(200).json({ ok: true, pinned: _pinnedMsg });
    }

    /* 고정 해제 */
    if (action === 'unpin') {
      _pinnedMsg = null;
      return res.status(200).json({ ok: true, pinned: null });
    }

    /* 삭제 */
    if (action === 'delete' && msgId) {
      if (!author_name) return res.status(400).json({ error: 'author_name required' });
      if (SB_URL && SB_KEY) {
        try {
          await sb('DELETE', `/chat_messages?id=eq.${msgId}&author_name=eq.${encodeURIComponent(author_name)}&author_provider=eq.${encodeURIComponent(author_provider || '')}`);
          return res.status(200).json({ ok: true, deleted: true });
        } catch (e) { return res.status(200).json({ ok: false, error: e.message }); }
      }
      _mem = _mem.filter(m => String(m.id) !== String(msgId));
      return res.status(200).json({ ok: true, deleted: true });
    }

    if (!content || !author_name) return res.status(400).json({ error: 'content and author_name required' });
    if (content.length > 500) return res.status(400).json({ error: 'message too long (max 500)' });
    if (!author_provider) return res.status(401).json({ error: 'login required' });

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
        /* 답글이면 해당 사용자에게 푸시 알림 */
        if (reply_to && reply_to.name && reply_to.name !== author_name) {
          await _notifyReply(reply_to, author_name, content).catch(e =>
            console.error('[Chat] push notify error:', e.message)
          );
        }
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

/* ── 답글 푸시 알림 ── */
async function _notifyReply(replyTo, senderName, content) {
  if (!SB_URL || !SB_KEY) return;

  const VAPID_PUB = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRV = process.env.VAPID_PRIVATE_KEY;
  if (!VAPID_PUB || !VAPID_PRV) return;

  /* 대상 사용자의 푸시 구독 조회 */
  const targetName = encodeURIComponent(replyTo.name);
  const { data } = await sb('GET', `/push_subscriptions?user_name=eq.${targetName}&select=subscription`);
  if (!Array.isArray(data) || !data.length) return;

  /* VAPID 키 설정 (SPKI→raw 변환) */
  let vapidPub = VAPID_PUB;
  try {
    const pad = '='.repeat((4 - vapidPub.length % 4) % 4);
    const raw = Buffer.from(vapidPub.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
    if (raw.length === 91) {
      vapidPub = raw.slice(26).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }
  } catch {}

  webpush.setVapidDetails('mailto:admin@ai-music-studio.app', vapidPub, VAPID_PRV);

  const preview = (content || '').slice(0, 60);
  const payload = JSON.stringify({
    title: `💬 ${senderName}님이 답장했어요`,
    body: preview,
    icon: '/icon-192.png',
    url: 'https://ai-music-studio-bice.vercel.app/?tab=community&chat=1',
    badge: '/icon-72.png',
  });

  for (const row of data) {
    const sub = row.subscription;
    if (!sub?.endpoint) continue;
    try {
      await webpush.sendNotification(sub, payload);
    } catch (e) {
      /* 410 Gone = 만료된 구독 → 삭제 */
      if (e.statusCode === 410) {
        await sb('DELETE', `/push_subscriptions?user_name=eq.${targetName}&subscription->>endpoint=eq.${encodeURIComponent(sub.endpoint)}`).catch(() => {});
      }
    }
  }
}
