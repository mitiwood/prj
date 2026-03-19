/**
 * /api/tracks — Supabase 트랙 API (완전판)
 *
 * GET  ?public=true                   → 커뮤니티 공개 트랙 (인증 불필요)
 * GET  ?owner=name&provider=xxx       → 특정 사용자 트랙 (인증 불필요)
 * GET  Authorization: Bearer ADMIN    → 관리자 전체 조회
 * POST                                → 트랙 저장
 * PATCH ?id=xxx&action=like|unlike|dislike|undislike → 좋아요/싫어요
 * DELETE ?id=xxx  Authorization       → 관리자 삭제
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PWD = process.env.ADMIN_SECRET || "kenny2024!";
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = (process.env.TELEGRAM_CHAT_ID || "").trim();

let _mem = []; // fallback

async function _tgNotify(event, data) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    const ts = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const icon = { music_created: "🎵", mv_created: "🎬", new_user: "👤", comment: "💬", track_deleted: "🗑" }[event] || "📌";
    const label = { music_created: "새 곡 생성", mv_created: "MV 완성", new_user: "새 로그인", comment: "새 댓글", track_deleted: "트랙 삭제" }[event] || event;
    let text = `${icon} *${label}*\n`;
    if (data.title) text += `제목: ${data.title}\n`;
    if (data.mode) text += `모드: ${data.mode}\n`;
    if (data.user) text += `생성자: ${data.user}\n`;
    if (data.author) text += `작성자: ${data.author}\n`;
    text += `⏰ ${ts}`;
    const body = Buffer.from(JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: "Markdown" }), "utf-8");
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": String(body.length) },
      body,
    });
  } catch(e) { console.warn("[TG]", e.message); }
}

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
  const isPublic = req.query?.public === "true";
  const ownerName = req.query?.owner || "";
  const ownerProv = req.query?.provider || "";
  const limit = Math.min(parseInt(req.query?.limit || "200"), 500);
  const offset = parseInt(req.query?.offset || "0");

  /* ─── GET ─── */
  if (req.method === "GET") {
    if (!isPublic && !ownerName && !isAdmin)
      return res.status(401).json({ error: "Unauthorized" });
    try {
      let filter;
      if (isAdmin) {
        filter = `/tracks?order=created_at.desc&limit=${limit}&offset=${offset}&select=*`;
      } else if (ownerName) {
        filter = `/tracks?owner_name=eq.${encodeURIComponent(ownerName)}&owner_provider=eq.${encodeURIComponent(ownerProv)}&order=created_at.desc&limit=${limit}&select=*`;
      } else {
        filter = `/tracks?is_public=eq.true&order=comm_likes.desc,created_at.desc&limit=${limit}&offset=${offset}&select=*`;
      }
      const rows = await sb(filter);
      const mapped = (rows || []).map((r) => ({
        ...r,
        created: r.created_at ? new Date(r.created_at).getTime() : 0,
      }));
      return res
        .status(200)
        .json({ tracks: mapped, total: mapped.length, source: "supabase" });
    } catch (e) {
      console.warn("[tracks GET]", e.message);
      let list = isAdmin ? _mem : _mem.filter((t) => t.is_public);
      if (ownerName)
        list = _mem.filter(
          (t) => t.owner_name === ownerName && t.owner_provider === ownerProv,
        );
      list = [...list].sort((a, b) => (b.created || 0) - (a.created || 0));
      return res
        .status(200)
        .json({
          tracks: list,
          total: list.length,
          source: "memory",
          note: e.message,
        });
    }
  }

  /* ─── POST: 저장 ─── */
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
      const {
        id,
        taskId,
        title,
        audio_url,
        video_url,
        image_url,
        tags,
        lyrics,
        genMode,
        owner_name,
        owner_avatar,
        owner_provider,
      } = b;
      if (!id || !audio_url)
        return res.status(400).json({ error: "id and audio_url required" });
      const now = Date.now();
      const row = {
        id,
        task_id: taskId || "",
        title: title || "무제",
        audio_url,
        video_url: video_url || "",
        image_url: image_url || "",
        tags: tags || "",
        lyrics: (lyrics || "").slice(0, 5000),
        gen_mode: genMode || "custom",
        owner_name: owner_name || "익명",
        owner_avatar: owner_avatar || "",
        owner_provider: owner_provider || "guest",
        is_public: true,
        comm_likes: 0,
        comm_dislikes: 0,
        comm_plays: 0,
        created_at: new Date(now).toISOString(),
      };
      let src = "memory";
      try {
        await sb("/tracks?on_conflict=id", {
          method: "POST",
          prefer: "resolution=merge-duplicates",
          body: JSON.stringify(row),
        });
        src = "supabase";
      } catch (e) {
        console.warn("[tracks POST]", e.message);
        const idx = _mem.findIndex((t) => t.id === id);
        if (idx >= 0) _mem[idx] = { ..._mem[idx], ...row };
        else {
          _mem.unshift(row);
          if (_mem.length > 500) _mem = _mem.slice(0, 500);
        }
      }
      /* 텔레그램 알림 (응답 전에 완료 대기) */
      await _tgNotify(video_url ? "mv_created" : "music_created", {
        title: title || "무제",
        mode: genMode || "custom",
        user: owner_name || "익명",
      });
      return res.status(200).json({ success: true, source: src });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  /* ─── PATCH: 좋아요/싫어요/숨기기 ─── */
  if (req.method === "PATCH") {
    const id = req.query?.id;
    const action = req.query?.action || "like"; // like|unlike|dislike|undislike|hide|show
    if (!id) return res.status(400).json({ error: "id required" });

    /* 별점 처리 */
    if (action === "rate") {
      let b = req.body;
      if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
      const rating = Math.min(5, Math.max(0, parseInt(b?.rating || "0")));
      try {
        await sb(`/tracks?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH", prefer: "return=minimal",
          body: JSON.stringify({ comm_rating: rating }),
        });
        const idx = _mem.findIndex(t => t.id === id);
        if (idx >= 0) _mem[idx].comm_rating = rating;
        return res.status(200).json({ success: true, comm_rating: rating, source: "supabase" });
      } catch (e) {
        const idx = _mem.findIndex(t => t.id === id);
        if (idx >= 0) { _mem[idx].comm_rating = rating; return res.status(200).json({ success: true, comm_rating: rating, source: "memory" }); }
        return res.status(500).json({ error: e.message });
      }
    }

    /* 숨기기/공개 처리 */
    if (action === "hide" || action === "show") {
      if (!isAdmin) return res.status(401).json({ error: "Unauthorized" });
      const isPublic = action === "show";
      try {
        await sb(`/tracks?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH", prefer: "return=minimal",
          body: JSON.stringify({ is_public: isPublic }),
        });
        const idx = _mem.findIndex(t => t.id === id);
        if (idx >= 0) _mem[idx].is_public = isPublic;
        return res.status(200).json({ success: true, is_public: isPublic, source: "supabase" });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    const col = action.includes("dislike") ? "comm_dislikes" : "comm_likes";
    const delta = action.startsWith("un") ? -1 : 1;
    try {
      try {
        const rows = await sb(
          `/tracks?id=eq.${encodeURIComponent(id)}&select=${col}`,
        );
        const cur = Math.max(0, (rows?.[0]?.[col] || 0) + delta);
        await sb(`/tracks?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          prefer: "return=minimal",
          body: JSON.stringify({ [col]: cur }),
        });
        return res
          .status(200)
          .json({ success: true, [col]: cur, source: "supabase" });
      } catch (e) {
        const idx = _mem.findIndex((t) => t.id === id);
        if (idx >= 0) {
          _mem[idx][col] = Math.max(0, (_mem[idx][col] || 0) + delta);
          return res
            .status(200)
            .json({ success: true, [col]: _mem[idx][col], source: "memory" });
        }
        return res.status(404).json({ error: "not found" });
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  /* ─── PATCH /hide: is_public 토글 (관리자) ─── */
  /* URL: /api/tracks/hide?id=xxx 또는 /api/tracks?id=xxx&action=hide */
  const isHideAction =
    req.url?.includes("/hide") || req.query?.action === "hide";
  if (req.method === "PATCH" && isHideAction) {
    if (!isAdmin) return res.status(401).json({ error: "Unauthorized" });
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: "id required" });
    try {
      let b = req.body;
      if (typeof b === "string") {
        try {
          b = JSON.parse(b);
        } catch {
          b = {};
        }
      }
      const isPublic = b?.is_public ?? false;
      try {
        await sb(`/tracks?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          prefer: "return=minimal",
          body: JSON.stringify({ is_public: isPublic }),
        });
        /* memory fallback */
        const idx = _mem.findIndex((t) => t.id === id);
        if (idx >= 0) _mem[idx].is_public = isPublic;
        return res.status(200).json({ success: true, is_public: isPublic });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  /* ─── DELETE: 관리자 삭제 ─── */
  if (req.method === "DELETE") {
    if (!isAdmin) return res.status(401).json({ error: "Unauthorized" });
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: "id required" });
    try {
      await sb(`/tracks?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        prefer: "return=minimal",
      });
      await _tgNotify("track_deleted", { title: `트랙 ID: ${id}`, user: "관리자" });
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
