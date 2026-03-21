/**
 * /api/comments — Supabase 댓글 API
 *
 * GET  ?track_id=xxx                        → 트랙 댓글 조회 (is_hidden=false만)
 * GET  ?track_id=xxx  Authorization: Admin  → 관리자 전체 조회 (숨김 포함)
 * POST body: {track_id, parent_id, content, author_name, author_avatar, author_provider} → 댓글 작성
 * DELETE ?id=xxx  Authorization             → 관리자 삭제 (is_hidden=true)
 * PATCH ?id=xxx&action=hide|show  Authorization → 관리자 숨김/공개
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PWD = process.env.ADMIN_SECRET || "kenny2024!";
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = (process.env.TELEGRAM_CHAT_ID || "").trim();

let _mem = []; // fallback

async function _kakaoNotify(event, data) {
  try {
    await fetch('https://ai-music-studio-bice.vercel.app/api/kakao-notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data }),
    });
  } catch {}
}

async function _tgComment(author, text, trackTitle) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    const ts = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    let msg = `💬 *새 댓글*\n`;
    msg += `작성자: ${author || "익명"}\n`;
    msg += `내용: ${(text || "").slice(0, 200)}\n`;
    if(trackTitle) msg += `곡: ${trackTitle}\n`;
    msg += `⏰ ${ts}`;
    const body = Buffer.from(JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: "Markdown" }), "utf-8");
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": String(body.length) },
      body,
    });
  } catch(e) { console.warn("[TG]", e.message); }
}

async function sb(path, opts = {}) {
  if (!SB_URL || !SB_KEY) throw new Error("no_supabase");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`${SB_URL}/rest/v1${path}`, {
      ...opts,
      signal: controller.signal,
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json; charset=utf-8",
        Prefer: opts.prefer || "return=representation",
        ...(opts.headers || {}),
      },
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(`SB ${r.status}: ${txt.slice(0, 200)}`);
    return txt ? JSON.parse(txt) : null;
  } finally {
    clearTimeout(timeout);
  }
}

/* Supabase REST API로 테이블 생성 (PostgREST에는 DDL이 없으므로 pg_net or http extension 필요)
   테이블이 없으면 메모리 폴백으로 동작하고, Supabase Dashboard에서 수동 생성 권장 */

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  track_id text NOT NULL,
  parent_id text,
  author_name text NOT NULL DEFAULT '익명',
  author_avatar text DEFAULT '',
  author_provider text DEFAULT 'guest',
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  is_hidden boolean DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_comments_track_id ON comments(track_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
`;

let _tableChecked = false;

let _sbAvailable = false;
async function ensureTable() {
  if (_tableChecked && _sbAvailable) return;
  _tableChecked = true;
  if (!SB_URL || !SB_KEY) return;
  try {
    await sb("/comments?select=id&limit=1");
    _sbAvailable = true;
  } catch (e) {
    console.warn("[comments] table not found, creating...", e.message.slice(0, 80));
    /* Supabase SQL 실행으로 테이블 자동 생성 시도 */
    try {
      const sqlRes = await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
          apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: CREATE_TABLE_SQL }),
      });
      if (sqlRes.ok) {
        console.log("[comments] table created via rpc");
        _sbAvailable = true;
        return;
      }
    } catch (_) {}
    /* rpc 실패 시 직접 POST로 첫 데이터 삽입 시도 (테이블 존재 확인) */
    try {
      const testRes = await fetch(`${SB_URL}/rest/v1/comments`, {
        method: "POST",
        headers: {
          apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          track_id: "_init_", author_name: "system", content: "table init",
          is_hidden: true, created_at: new Date().toISOString(),
        }),
      });
      if (testRes.ok || testRes.status === 201) {
        _sbAvailable = true;
        /* 초기화 레코드 삭제 */
        await fetch(`${SB_URL}/rest/v1/comments?track_id=eq._init_`, {
          method: "DELETE",
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: "return=minimal" },
        });
      }
    } catch (_) {}
    if (!_sbAvailable) console.warn("[comments] Supabase not available, using memory fallback");
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,DELETE,OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") return res.status(200).end();

  const authHdr = req.headers.authorization || "";
  const isAdmin = authHdr === `Bearer ${ADMIN_PWD}`;

  await ensureTable();

  /* ─── GET: 댓글 조회 ─── */
  if (req.method === "GET") {
    /* 배치 카운트 API — 한 번에 여러 트랙의 댓글 수 조회 */
    if (req.query?.action === 'counts' && req.query?.ids) {
      const ids = req.query.ids.split(',').filter(Boolean).slice(0, 50);
      if (!ids.length) return res.status(400).json({ error: 'ids required' });
      const counts = {};
      if (_sbAvailable) {
        try {
          /* Supabase에서 트랙별 댓글 수를 한 번에 조회 */
          const filter = ids.map(id => `track_id.eq.${encodeURIComponent(id)}`).join(',');
          const rows = await sb(`/comments?or=(${filter})&is_hidden=eq.false&select=track_id`);
          ids.forEach(id => { counts[id] = 0; });
          (rows || []).forEach(r => { counts[r.track_id] = (counts[r.track_id] || 0) + 1; });
        } catch (e) {
          console.warn('[comments counts sb]', e.message);
          ids.forEach(id => { counts[id] = _mem.filter(c => c.track_id === id && !c.is_hidden).length; });
        }
      } else {
        ids.forEach(id => { counts[id] = _mem.filter(c => c.track_id === id && !c.is_hidden).length; });
      }
      res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
      return res.status(200).json({ ok: true, counts });
    }

    const trackId = req.query?.track_id;
    const all = req.query?.all === "true";
    const limit = parseInt(req.query?.limit) || 200;

    /* 관리자 전체 조회 */
    if (all && isAdmin) {
      if (_sbAvailable) {
        try {
          const rows = await sb(`/comments?order=created_at.desc&limit=${limit}&select=*`);
          return res.status(200).json({ comments: rows || [], total: (rows || []).length, source: "supabase" });
        } catch (e) { console.warn("[comments GET all sb]", e.message); }
      }
      const sorted = [..._mem].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
      return res.status(200).json({ comments: sorted, total: sorted.length, source: "memory" });
    }

    if (!trackId) return res.status(400).json({ error: "track_id required" });

    if (_sbAvailable) {
      try {
        let filter = `/comments?track_id=eq.${encodeURIComponent(trackId)}&order=created_at.asc&limit=${limit}&select=*`;
        if (!isAdmin) filter += "&is_hidden=eq.false";
        const rows = await sb(filter);
        return res.status(200).json({ comments: rows || [], total: (rows || []).length, source: "supabase" });
      } catch (e) { console.warn("[comments GET sb]", e.message); }
    }
    let list = _mem.filter((c) => c.track_id === trackId);
    if (!isAdmin) list = list.filter((c) => !c.is_hidden);
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return res.status(200).json({ comments: list.slice(0, limit), total: list.length, source: "memory" });
  }

  /* ─── POST: 댓글 작성 ─── */
  if (req.method === "POST") {
    let b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
    b = b || {};
    const { track_id, parent_id, content, author_name, author_avatar, author_provider } = b;
    if (!track_id || !content) return res.status(400).json({ error: "track_id and content required" });

    const row = {
      track_id, parent_id: parent_id || null,
      author_name: author_name || "익명", author_avatar: author_avatar || "",
      author_provider: author_provider || "guest",
      content: content.slice(0, 2000), created_at: new Date().toISOString(), is_hidden: false,
    };

    if (_sbAvailable) {
      try {
        const created = await sb("/comments", { method: "POST", body: JSON.stringify(row) });
        await Promise.allSettled([
          _tgComment(row.author_name, row.content, row.track_id),
          _kakaoNotify('comment', { author: row.author_name, text: row.content, track: row.track_id }),
        ]);
        return res.status(200).json({ success: true, comment: created?.[0] || row, source: "supabase" });
      } catch (e) { console.warn("[comments POST sb]", e.message); }
    }
    row.id = crypto.randomUUID?.() || `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    _mem.push(row);
    if (_mem.length > 1000) _mem = _mem.slice(-1000);
    await Promise.allSettled([
      _tgComment(row.author_name, row.content, row.track_id),
      _kakaoNotify('comment', { author: row.author_name, text: row.content, track: row.track_id }),
    ]);
    return res.status(200).json({ success: true, comment: row, source: "memory" });
  }

  /* ─── PATCH: 관리자 숨김/공개 ─── */
  if (req.method === "PATCH") {
    if (!isAdmin) return res.status(401).json({ error: "Unauthorized" });
    const id = req.query?.id;
    const action = req.query?.action || "hide";
    if (!id) return res.status(400).json({ error: "id required" });

    const isHidden = action === "hide";
    if (_sbAvailable) {
      try {
        await sb(`/comments?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ is_hidden: isHidden }) });
        const mi = _mem.findIndex((c) => c.id === id); if (mi >= 0) _mem[mi].is_hidden = isHidden;
        return res.status(200).json({ success: true, is_hidden: isHidden, source: "supabase" });
      } catch (e) { console.warn("[comments PATCH sb]", e.message); }
    }
    const mi = _mem.findIndex((c) => c.id === id);
    if (mi >= 0) { _mem[mi].is_hidden = isHidden; return res.status(200).json({ success: true, is_hidden: isHidden, source: "memory" }); }
    return res.status(404).json({ error: "not found" });
  }

  /* ─── DELETE: 댓글 삭제 (soft delete) — 관리자만 ─── */
  if (req.method === "DELETE") {
    if (!isAdmin) return res.status(401).json({ error: "Unauthorized" });
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: "id required" });

    if (_sbAvailable) {
      try {
        await sb(`/comments?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ is_hidden: true }) });
        const mi = _mem.findIndex((c) => c.id === id); if (mi >= 0) _mem[mi].is_hidden = true;
        return res.status(200).json({ success: true, source: "supabase" });
      } catch (e) { console.warn("[comments DELETE sb]", e.message); }
    }
    const mi = _mem.findIndex((c) => c.id === id);
    if (mi >= 0) { _mem[mi].is_hidden = true; return res.status(200).json({ success: true, source: "memory" }); }
    return res.status(404).json({ error: "not found" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
