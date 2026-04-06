/**
 * /api/chat — 커뮤니티 채팅 API
 *
 * GET  ?room=general&limit=50&since=ts    → 메시지 조회 + 인사이트 + 리액션
 * GET  ?q=검색어&room=general             → 메시지 검색
 * GET  ?action=rooms                      → 채팅방 목록
 * POST body: {room, content, ...}         → 메시지 전송
 * POST body: {action:'react', ...}        → 리액션 토글
 * POST body: {action:'edit', ...}         → 메시지 수정
 * POST body: {action:'report', ...}       → 신고
 * POST body: {action:'delete', ...}       → 삭제
 * POST body: {action:'pin'/'unpin', ...}  → 고정
 * POST body: {action:'typing', ...}       → 타이핑 인디케이터
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

/* 채팅방 목록 */
const CHAT_ROOMS = [
  { id: 'general', label: '전체', icon: '💬' },
  { id: 'kpop',    label: 'K-POP', icon: '🎤' },
  { id: 'hiphop',  label: '힙합',  icon: '🎧' },
  { id: 'indie',   label: '인디',  icon: '🎸' },
  { id: 'rnb',     label: 'R&B',   icon: '🎵' },
  { id: 'edm',     label: 'EDM',   icon: '🎛' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* GET — 메시지 조회 / 검색 / 방 목록 */
  if (req.method === 'GET') {
    const { action, room = 'general', limit = '50', since, user, provider, q } = req.query || {};

    /* 채팅방 목록 */
    if (action === 'rooms') {
      return res.status(200).json({ ok: true, rooms: CHAT_ROOMS });
    }

    /* 일회성 테이블 마이그레이션 */
    if (action === 'setup_tables' && SB_URL && SB_KEY) {
      const projectRef = SB_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
      if (!projectRef) return res.status(500).json({ error: 'cannot parse project ref' });
      const sqls = [
        `CREATE TABLE IF NOT EXISTS public.chat_reactions (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, msg_id TEXT NOT NULL, room TEXT NOT NULL DEFAULT 'general', emoji TEXT NOT NULL, author_name TEXT NOT NULL, author_provider TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(msg_id, emoji, author_name, author_provider))`,
        `ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY`,
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_reactions' AND policyname='chat_reactions_read') THEN CREATE POLICY chat_reactions_read ON public.chat_reactions FOR SELECT USING (true); END IF; END $$`,
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_reactions' AND policyname='chat_reactions_write') THEN CREATE POLICY chat_reactions_write ON public.chat_reactions FOR ALL USING (auth.role()='service_role'); END IF; END $$`,
        `CREATE INDEX IF NOT EXISTS idx_chat_reactions_msg ON public.chat_reactions(msg_id)`,
        `CREATE TABLE IF NOT EXISTS public.chat_reports (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, msg_id TEXT NOT NULL, room TEXT DEFAULT 'general', reporter_name TEXT NOT NULL, reporter_provider TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`,
        `ALTER TABLE public.chat_reports ENABLE ROW LEVEL SECURITY`,
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_reports' AND policyname='chat_reports_write') THEN CREATE POLICY chat_reports_write ON public.chat_reports FOR ALL USING (auth.role()='service_role'); END IF; END $$`,
        `CREATE INDEX IF NOT EXISTS idx_chat_reports_msg ON public.chat_reports(msg_id)`,
        `ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ DEFAULT NULL`,
      ];
      const results = [];
      for (const query of sqls) {
        try {
          const r = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
          });
          const txt = await r.text(); let parsed; try { parsed = JSON.parse(txt); } catch { parsed = txt; }
          results.push({ ok: r.status < 300, status: r.status, q: query.slice(0, 50), res: parsed });
        } catch (e) { results.push({ ok: false, q: query.slice(0, 50), error: e.message }); }
      }
      return res.status(200).json({ ok: results.every(r => r.ok), results });
    }

    /* 온라인 트래킹 */
    if (user) _trackOnline(user, provider || '');

    if (SB_URL && SB_KEY) {
      try {
        const lim = Math.min(parseInt(limit) || 50, 100);

        /* 검색 모드 */
        if (q && q.trim()) {
          const safeQ = q.trim().replace(/'/g, "''").slice(0, 100);
          const { data } = await sb('GET', `/chat_messages?room=eq.${encodeURIComponent(room)}&content=ilike.*${encodeURIComponent(safeQ)}*&order=created_at.desc&limit=${lim}`);
          const msgs = Array.isArray(data) ? data.reverse() : [];
          return res.status(200).json({ ok: true, messages: msgs, search: true });
        }

        /* 일반 조회 */
        let path = `/chat_messages?room=eq.${encodeURIComponent(room)}&order=created_at.desc&limit=${lim}`;
        if (since) path += `&created_at=gt.${new Date(parseInt(since)).toISOString()}`;
        const { data } = await sb('GET', path);
        const msgs = Array.isArray(data) ? data.reverse() : [];

        /* 리액션 로드 — 해당 메시지 ID 묶음으로 1회 조회 */
        let reactMap = {};
        if (msgs.length) {
          const msgIds = msgs.map(m => m.id).filter(Boolean);
          if (msgIds.length) {
            try {
              const { data: rxs } = await sb('GET', `/chat_reactions?msg_id=in.(${msgIds.join(',')})&select=msg_id,emoji,author_name,author_provider`);
              if (Array.isArray(rxs)) {
                rxs.forEach(r => {
                  if (!reactMap[r.msg_id]) reactMap[r.msg_id] = [];
                  reactMap[r.msg_id].push({ emoji: r.emoji, name: r.author_name, provider: r.author_provider });
                });
              }
            } catch {}
          }
          msgs.forEach(m => { m._reactions = reactMap[String(m.id)] || []; });
        }

        /* 인사이트용 오늘 메시지 */
        let allToday = msgs;
        if (since) {
          try {
            const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
            const { data: td } = await sb('GET', `/chat_messages?room=eq.${encodeURIComponent(room)}&created_at=gte.${todayStart.toISOString()}&order=created_at.desc&limit=200`);
            allToday = Array.isArray(td) ? td : [];
          } catch {}
        }

        return res.status(200).json({ ok: true, messages: msgs, insight: _buildInsight(allToday), typing: await _getTyping(), pinned: _pinnedMsg, rooms: CHAT_ROOMS });
      } catch (e) {
        const lim = Math.min(parseInt(limit) || 50, 100);
        const msgs = _mem.filter(m => m.room === room).slice(-lim);
        return res.status(200).json({ ok: true, messages: msgs, insight: _buildInsight(msgs), typing: await _getTyping(), pinned: _pinnedMsg, rooms: CHAT_ROOMS });
      }
    }
    const lim = Math.min(parseInt(limit) || 50, 100);
    const msgs = _mem.filter(m => m.room === room).slice(-lim);
    return res.status(200).json({ ok: true, messages: msgs, insight: _buildInsight(msgs), typing: await _getTyping(), pinned: _pinnedMsg, rooms: CHAT_ROOMS });
  }

  /* POST */
  if (req.method === 'POST') {
    const { action, msgId, room = 'general', content, author_name, author_avatar = '', author_provider = '', reply_to = null, emoji, reason } = req.body || {};

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
          /* 해당 메시지 리액션도 삭제 */
          await sb('DELETE', `/chat_reactions?msg_id=eq.${msgId}`).catch(() => {});
          return res.status(200).json({ ok: true, deleted: true });
        } catch (e) { return res.status(200).json({ ok: false, error: e.message }); }
      }
      _mem = _mem.filter(m => String(m.id) !== String(msgId));
      return res.status(200).json({ ok: true, deleted: true });
    }

    /* 리액션 토글 */
    if (action === 'react' && msgId && emoji) {
      if (!author_name || !author_provider) return res.status(401).json({ error: 'login required' });
      if (SB_URL && SB_KEY) {
        try {
          const { data: existing } = await sb('GET', `/chat_reactions?msg_id=eq.${encodeURIComponent(String(msgId))}&emoji=eq.${encodeURIComponent(emoji)}&author_name=eq.${encodeURIComponent(author_name)}&author_provider=eq.${encodeURIComponent(author_provider)}&limit=1`);
          if (Array.isArray(existing) && existing.length) {
            await sb('DELETE', `/chat_reactions?msg_id=eq.${encodeURIComponent(String(msgId))}&emoji=eq.${encodeURIComponent(emoji)}&author_name=eq.${encodeURIComponent(author_name)}&author_provider=eq.${encodeURIComponent(author_provider)}`);
            return res.status(200).json({ ok: true, toggled: 'removed' });
          } else {
            await sb('POST', '/chat_reactions', { msg_id: String(msgId), room, emoji, author_name, author_provider, created_at: new Date().toISOString() });
            return res.status(200).json({ ok: true, toggled: 'added' });
          }
        } catch (e) { return res.status(200).json({ ok: false, error: e.message }); }
      }
      return res.status(200).json({ ok: true, toggled: 'local' });
    }

    /* 메시지 수정 */
    if (action === 'edit' && msgId) {
      if (!content || !author_name) return res.status(400).json({ error: 'content and author_name required' });
      if (content.length > 500) return res.status(400).json({ error: 'message too long' });
      if (SB_URL && SB_KEY) {
        try {
          await sb('PATCH', `/chat_messages?id=eq.${msgId}&author_name=eq.${encodeURIComponent(author_name)}&author_provider=eq.${encodeURIComponent(author_provider || '')}`, {
            content: content.slice(0, 500),
            edited_at: new Date().toISOString(),
          });
          return res.status(200).json({ ok: true });
        } catch (e) { return res.status(200).json({ ok: false, error: e.message }); }
      }
      const m = _mem.find(m => String(m.id) === String(msgId) && m.author_name === author_name);
      if (m) { m.content = content.slice(0, 500); m.edited_at = new Date().toISOString(); }
      return res.status(200).json({ ok: true });
    }

    /* 신고 */
    if (action === 'report' && msgId) {
      if (!author_name || !reason) return res.status(400).json({ error: 'author_name and reason required' });
      const rateKey = `report_${author_name}_${author_provider}`;
      if (!_checkRate(rateKey, 3, 60000)) return res.status(429).json({ error: '신고를 너무 많이 했어요' });
      if (SB_URL && SB_KEY) {
        try {
          await sb('POST', '/chat_reports', {
            msg_id: String(msgId),
            room,
            reporter_name: author_name,
            reporter_provider: author_provider || '',
            reason: reason.slice(0, 200),
            created_at: new Date().toISOString(),
          });
        } catch {}
      }
      return res.status(200).json({ ok: true });
    }

    /* 메시지 전송 */
    if (!content || !author_name) return res.status(400).json({ error: 'content and author_name required' });
    if (content.length > 500) return res.status(400).json({ error: 'message too long (max 500)' });
    if (!author_provider) return res.status(401).json({ error: 'login required' });

    const rateKey = `chat_${author_name}_${author_provider}`;
    if (!_checkRate(rateKey, 5)) return res.status(429).json({ error: '메시지를 너무 빠르게 보내고 있어요' });

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
        /* 답글 푸시 알림 */
        if (reply_to && reply_to.name && reply_to.name !== author_name) {
          await _notifyUser(reply_to.name, author_name, content, 'reply').catch(() => {});
        }
        /* 멘션 알림 — @username 파싱 */
        const mentions = content.match(/@([^\s@#\[\]{}|\\^`<>]+)/g) || [];
        for (const mention of mentions) {
          const targetName = mention.slice(1);
          if (targetName && targetName !== author_name) {
            await _notifyUser(targetName, author_name, content, 'mention').catch(() => {});
          }
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

/* ── 푸시 알림 (답글 + 멘션 공통) ── */
async function _notifyUser(targetName, senderName, content, type) {
  if (!SB_URL || !SB_KEY) return;
  const VAPID_PUB = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRV = process.env.VAPID_PRIVATE_KEY;
  if (!VAPID_PUB || !VAPID_PRV) return;

  const { data } = await sb('GET', `/push_subscriptions?user_name=eq.${encodeURIComponent(targetName)}&select=subscription`);
  if (!Array.isArray(data) || !data.length) return;

  let vapidPub = VAPID_PUB;
  try {
    const pad = '='.repeat((4 - vapidPub.length % 4) % 4);
    const raw = Buffer.from(vapidPub.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
    if (raw.length === 91) vapidPub = raw.slice(26).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  } catch {}

  webpush.setVapidDetails('mailto:admin@ai-music-studio.app', vapidPub, VAPID_PRV);

  const title = type === 'mention' ? `🔔 ${senderName}님이 회원님을 멘션했어요` : `💬 ${senderName}님이 답장했어요`;
  const payload = JSON.stringify({
    title,
    body: (content || '').slice(0, 60),
    icon: '/icon-192.png',
    url: 'https://ddinggok.com/?tab=community&chat=1',
    badge: '/icon-72.png',
  });

  for (const row of data) {
    const sub = row.subscription;
    if (!sub?.endpoint) continue;
    try {
      await webpush.sendNotification(sub, payload);
    } catch (e) {
      if (e.statusCode === 410) {
        await sb('DELETE', `/push_subscriptions?user_name=eq.${encodeURIComponent(targetName)}&subscription->>endpoint=eq.${encodeURIComponent(sub.endpoint)}`).catch(() => {});
      }
    }
  }
}
