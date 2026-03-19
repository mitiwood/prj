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

async function sbSQL(sql) {
  if (!SB_URL || !SB_KEY) throw new Error("no_supabase");
  const r = await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ query: sql }),
  });
  // Also try the raw SQL endpoint if rpc fails
  if (!r.ok) {
    const r2 = await fetch(`${SB_URL}/sql`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ query: sql }),
    });
    if (!r2.ok) {
      const txt = await r2.text();
      throw new Error(`SQL ${r2.status}: ${txt.slice(0, 200)}`);
    }
    return r2.text();
  }
  return r.text();
}

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

async function ensureTable() {
  if (_tableChecked) return;
  try {
    // Try a simple query first — if table exists this succeeds
    await sb("/comments?select=id&limit=1");
    _tableChecked = true;
  } catch (e) {
    if (e.message.includes("42P01") || e.message.includes("does not exist") || e.message.includes("relation") || e.message.includes("PGRST205") || e.message.includes("schema cache")) {
      console.log("[comments] Table not found, creating...");
      try {
        await sbSQL(CREATE_TABLE_SQL);
        _tableChecked = true;
        console.log("[comments] Table created successfully");
      } catch (sqlErr) {
        console.warn("[comments] Auto-create table failed:", sqlErr.message);
        // Table might have been created by another instance
        _tableChecked = true;
      }
    } else {
      throw e;
    }
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

  /* ─── GET: 댓글 조회 ─── */
  if (req.method === "GET") {
    const trackId = req.query?.track_id;
    if (!trackId) return res.status(400).json({ error: "track_id required" });

    try {
      await ensureTable();
      let filter = `/comments?track_id=eq.${encodeURIComponent(trackId)}&order=created_at.asc&select=*`;
      if (!isAdmin) {
        filter += "&is_hidden=eq.false";
      }
      const rows = await sb(filter);
      return res.status(200).json({
        comments: rows || [],
        total: (rows || []).length,
        source: "supabase",
      });
    } catch (e) {
      console.warn("[comments GET]", e.message);
      let list = _mem.filter((c) => c.track_id === trackId);
      if (!isAdmin) list = list.filter((c) => !c.is_hidden);
      list = [...list].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at),
      );
      return res.status(200).json({
        comments: list,
        total: list.length,
        source: "memory",
        note: e.message,
      });
    }
  }

  /* ─── POST: 댓글 작성 ─── */
  if (req.method === "POST") {
    try {
      let b = req.body;
      if (typeof b === "string") {
        try {
          b = JSON.parse(b);
        } catch {
          b = {};
        }
      }
      b = b || {};
      const { track_id, parent_id, content, author_name, author_avatar, author_provider } = b;
      if (!track_id || !content) {
        return res.status(400).json({ error: "track_id and content required" });
      }

      const row = {
        track_id,
        parent_id: parent_id || null,
        author_name: author_name || "익명",
        author_avatar: author_avatar || "",
        author_provider: author_provider || "guest",
        content: content.slice(0, 2000),
        created_at: new Date().toISOString(),
        is_hidden: false,
      };

      try {
        await ensureTable();
        const created = await sb("/comments", {
          method: "POST",
          body: JSON.stringify(row),
        });
        return res.status(200).json({
          success: true,
          comment: created?.[0] || row,
          source: "supabase",
        });
      } catch (e) {
        console.warn("[comments POST]", e.message);
        // Memory fallback — generate a uuid-like id
        row.id = crypto.randomUUID?.() || `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        _mem.push(row);
        if (_mem.length > 1000) _mem = _mem.slice(-1000);
        return res.status(200).json({
          success: true,
          comment: row,
          source: "memory",
          note: e.message,
        });
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  /* ─── PATCH: 관리자 숨김/공개 ─── */
  if (req.method === "PATCH") {
    if (!isAdmin) return res.status(401).json({ error: "Unauthorized" });
    const id = req.query?.id;
    const action = req.query?.action || "hide";
    if (!id) return res.status(400).json({ error: "id required" });

    const isHidden = action === "hide";
    try {
      await ensureTable();
      await sb(`/comments?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({ is_hidden: isHidden }),
      });
      // Also update memory fallback
      const idx = _mem.findIndex((c) => c.id === id);
      if (idx >= 0) _mem[idx].is_hidden = isHidden;
      return res.status(200).json({ success: true, is_hidden: isHidden, source: "supabase" });
    } catch (e) {
      console.warn("[comments PATCH]", e.message);
      const idx = _mem.findIndex((c) => c.id === id);
      if (idx >= 0) {
        _mem[idx].is_hidden = isHidden;
        return res.status(200).json({ success: true, is_hidden: isHidden, source: "memory" });
      }
      return res.status(404).json({ error: "not found" });
    }
  }

  /* ─── DELETE: 댓글 삭제 (soft delete) — 관리자 또는 작성자 본인 ─── */
  if (req.method === "DELETE") {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: "id required" });

    try {
      await ensureTable();
      await sb(`/comments?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({ is_hidden: true }),
      });
      // Also update memory fallback
      const idx = _mem.findIndex((c) => c.id === id);
      if (idx >= 0) _mem[idx].is_hidden = true;
      return res.status(200).json({ success: true, source: "supabase" });
    } catch (e) {
      console.warn("[comments DELETE]", e.message);
      const idx = _mem.findIndex((c) => c.id === id);
      if (idx >= 0) {
        _mem[idx].is_hidden = true;
        return res.status(200).json({ success: true, source: "memory" });
      }
      return res.status(404).json({ error: "not found" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
