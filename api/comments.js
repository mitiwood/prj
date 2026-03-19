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

let _mem = []; // fallback

async function sb(path, opts = {}) {
  if (!SB_URL || !SB_KEY) throw new Error("no_supabase");
  const r = await fetch(`${SB_URL}/rest/v1${path}`, {
    ...opts,
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
  if (_tableChecked) return;
  _tableChecked = true;
  if (!SB_URL || !SB_KEY) return;
  try {
    await sb("/comments?select=id&limit=1");
    _sbAvailable = true;
  } catch (e) {
    console.warn("[comments] Supabase table not available:", e.message.slice(0, 80));
    _sbAvailable = false;
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
        return res.status(200).json({ success: true, comment: created?.[0] || row, source: "supabase" });
      } catch (e) { console.warn("[comments POST sb]", e.message); }
    }
    row.id = crypto.randomUUID?.() || `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    _mem.push(row);
    if (_mem.length > 1000) _mem = _mem.slice(-1000);
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

  /* ─── DELETE: 댓글 삭제 (soft delete) — 관리자 또는 작성자 본인 ─── */
  if (req.method === "DELETE") {
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
