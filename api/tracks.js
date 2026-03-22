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

import { verifyJWT } from './_jwt.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PWD = process.env.ADMIN_SECRET;

let _mem = []; // fallback

/* Rate Limit: IP+액션별 인메모리 카운터 */
const _rateMap = {};
function _checkRate(key, maxPerMin) {
  const now = Date.now();
  if (!_rateMap[key]) _rateMap[key] = [];
  _rateMap[key] = _rateMap[key].filter(t => now - t < 60000);
  if (_rateMap[key].length >= maxPerMin) return false;
  _rateMap[key].push(now);
  return true;
}

async function sb(path, opts = {}) {
  if (!SB_URL || !SB_KEY) throw new Error("no_supabase");
  const r = await fetch(`${SB_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
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

  /* ─── GET: 알림 조회 ─── */
  if (req.method === "GET" && req.query?.action === "notifications") {
    const userName = req.query?.userName || "";
    const userProvider = req.query?.userProvider || "";
    if (!userName) return res.status(400).json({ error: "userName required" });
    try {
      const rows = await sb(`/notifications?user_name=ilike.${encodeURIComponent(userName)}&user_provider=eq.${encodeURIComponent(userProvider)}&order=created_at.desc&limit=30`);
      return res.status(200).json({ ok: true, notifications: rows || [] });
    } catch (e) {
      return res.status(200).json({ ok: true, notifications: [] });
    }
  }

  /* ─── GET ─── */
  if (req.method === "GET") {
    if (!isPublic && !ownerName && !isAdmin)
      return res.status(401).json({ error: "Unauthorized" });

    /* 경량 모드: 크리에이터 목록용 (필수 컬럼만) */
    const isLite = req.query?.mode === 'creators';
    const liteSelect = 'owner_name,owner_provider,owner_avatar,image_url,comm_likes,comm_plays,created_at';

    try {
      let filter;
      if (isAdmin) {
        filter = `/tracks?order=created_at.desc&limit=${limit}&offset=${offset}&select=*`;
      } else if (ownerName) {
        filter = `/tracks?owner_name=ilike.${encodeURIComponent(ownerName)}&owner_provider=eq.${encodeURIComponent(ownerProv)}&order=created_at.desc&limit=${limit}&select=*`;
      } else {
        const sel = isLite ? liteSelect : '*';
        filter = `/tracks?is_public=eq.true&order=comm_likes.desc,created_at.desc&limit=${limit}&offset=${offset}&select=${sel}`;
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
      return res.status(200).json({
        tracks: list,
        total: list.length,
        source: "memory",
        note: e.message,
      });
    }
  }

  /* ─── POST: 저장 (JWT 검증 + Rate Limit) ─── */
  if (req.method === "POST") {
    const jwtUser = verifyJWT(req);
    /* JWT 없어도 허용 (하위 호환) — 단, Rate Limit 적용 */
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    if (!_checkRate('post:' + ip, 10)) {
      return res.status(429).json({ error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' });
    }
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
        parent_id,
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
        parent_id: parent_id || null,
        owner_name: owner_name || "익명",
        owner_avatar: owner_avatar || "",
        owner_provider: owner_provider || "guest",
        is_public: true,
        comm_likes: 0,
        comm_dislikes: 0,
        comm_plays: 0,
        created_at: new Date(now).toISOString(),
      };
      try {
        await sb("/tracks?on_conflict=id", {
          method: "POST",
          prefer: "resolution=merge-duplicates",
          body: JSON.stringify(row),
        });
        return res.status(200).json({ success: true, source: "supabase" });
      } catch (e) {
        console.warn("[tracks POST]", e.message);
        const idx = _mem.findIndex((t) => t.id === id);
        if (idx >= 0) _mem[idx] = { ..._mem[idx], ...row };
        else {
          _mem.unshift(row);
          if (_mem.length > 500) _mem = _mem.slice(0, 500);
        }
        return res
          .status(200)
          .json({ success: true, source: "memory", note: e.message });
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  /* ─── PATCH: 좋아요/싫어요/숨기기/재생수/별점/플레이리스트 (Rate Limit) ─── */
  if (req.method === "PATCH") {
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    if (!_checkRate('patch:' + ip, 30)) {
      return res.status(429).json({ error: '요청이 너무 빈번합니다.' });
    }
    const id = req.query?.id;
    const action = req.query?.action || "like";

    /* 플레이리스트 추가 — id 불필요 */
    if (action === "playlist") {
      let b = req.body || {};
      if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
      const { track_id, title, audio_url, image_url, tags, owner_name, owner_provider } = b;
      if (!track_id) return res.status(400).json({ error: "track_id required" });
      try {
        await sb("/playlists", { method: "POST", prefer: "return=minimal", body: JSON.stringify({ track_id, title: title || "", audio_url: audio_url || "", image_url: image_url || "", tags: tags || "", owner_name: owner_name || "", owner_provider: owner_provider || "" }) });
        return res.status(200).json({ success: true });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    if (!id) return res.status(400).json({ error: "id required" });

    /* 재생수 카운팅 */
    if (action === "play") {
      try {
        const rows = await sb(`/tracks?id=eq.${encodeURIComponent(id)}&select=comm_plays`);
        const cur = (rows?.[0]?.comm_plays || 0) + 1;
        await sb(`/tracks?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ comm_plays: cur }) });
        return res.status(200).json({ success: true, comm_plays: cur });
      } catch (e) {
        const idx = _mem.findIndex((t) => t.id === id);
        if (idx >= 0) { _mem[idx].comm_plays = (_mem[idx].comm_plays || 0) + 1; return res.status(200).json({ success: true, comm_plays: _mem[idx].comm_plays, source: "memory" }); }
        return res.status(200).json({ success: true });
      }
    }

    /* 별점 */
    if (action === "rate") {
      let b = req.body || {};
      if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
      const rating = Math.max(0, Math.min(5, parseInt(b.rating) || 0));
      try {
        await sb(`/tracks?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ comm_rating: rating }) });
        return res.status(200).json({ success: true, comm_rating: rating });
      } catch (e) {
        const idx = _mem.findIndex((t) => t.id === id);
        if (idx >= 0) { _mem[idx].comm_rating = rating; }
        return res.status(200).json({ success: true, comm_rating: rating, source: "memory" });
      }
    }

    /* 숨기기/공개 처리 */
    if (action === "hide" || action === "show") {
      if (!isAdmin) return res.status(401).json({ error: "Unauthorized" });
      const isPublic = action === "show";
      try {
        await sb(`/tracks?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          prefer: "return=minimal",
          body: JSON.stringify({ is_public: isPublic }),
        });
        const idx = _mem.findIndex((t) => t.id === id);
        if (idx >= 0) _mem[idx].is_public = isPublic;
        return res
          .status(200)
          .json({ success: true, is_public: isPublic, source: "supabase" });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
      1;
    }

    /* 좋아요/싫어요 — likes 테이블 기반 중복 방지 */
    let b = req.body || {};
    if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
    const userName = b.userName || "";
    const userProvider = b.userProvider || "";
    const col = action.includes("dislike") ? "comm_dislikes" : "comm_likes";
    const likeType = action.includes("dislike") ? "dislike" : "like";
    const isUndo = action.startsWith("un");

    try {
      /* likes 테이블: 유저별 투표 추적 */
      if (userName && userProvider) {
        try {
          if (isUndo) {
            await sb(`/likes?user_name=ilike.${encodeURIComponent(userName)}&user_provider=eq.${encodeURIComponent(userProvider)}&track_id=eq.${encodeURIComponent(id)}&type=eq.${likeType}`, { method: "DELETE", prefer: "return=minimal" });
          } else {
            /* 중복 체크 */
            const existing = await sb(`/likes?user_name=ilike.${encodeURIComponent(userName)}&user_provider=eq.${encodeURIComponent(userProvider)}&track_id=eq.${encodeURIComponent(id)}&type=eq.${likeType}&select=id`);
            if (existing?.length > 0) {
              return res.status(200).json({ success: true, duplicate: true, message: "이미 투표했어요" });
            }
            /* 반대 투표 제거 */
            const opposite = likeType === "like" ? "dislike" : "like";
            try { await sb(`/likes?user_name=ilike.${encodeURIComponent(userName)}&user_provider=eq.${encodeURIComponent(userProvider)}&track_id=eq.${encodeURIComponent(id)}&type=eq.${opposite}`, { method: "DELETE", prefer: "return=minimal" }); } catch {}
            /* 투표 기록 */
            await sb("/likes", { method: "POST", prefer: "return=minimal", body: JSON.stringify({ user_name: userName, user_provider: userProvider, track_id: id, type: likeType }) });

            /* 곡 소유자에게 알림 (좋아요일 때만) */
            if (likeType === "like") {
              try {
                const trackRows = await sb(`/tracks?id=eq.${encodeURIComponent(id)}&select=owner_name,owner_provider,title`);
                const track = trackRows?.[0];
                if (track && track.owner_name && !(track.owner_name === userName && track.owner_provider === userProvider)) {
                  await sb("/notifications", { method: "POST", prefer: "return=minimal", body: JSON.stringify({
                    user_name: track.owner_name, user_provider: track.owner_provider,
                    type: "like", title: `❤️ "${track.title || '곡'}"에 좋아요!`,
                    body: `${userName}님이 좋아요를 눌렀어요`, data: JSON.stringify({ trackId: id, fromUser: userName })
                  })});
                  /* realtime 이벤트 발행 */
                  try { await fetch('https://ai-music-studio-bice.vercel.app/api/realtime', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_PWD}` },
                    body: JSON.stringify({ event: 'new_like', data: { targetUser: track.owner_name, fromUser: userName, trackTitle: track.title, trackId: id } })
                  }); } catch {}
                }
              } catch {}
            }
          }
        } catch (e) { console.warn("[likes]", e.message); }
      }

      /* tracks 카운터 업데이트 (기존 호환) */
      const delta = isUndo ? -1 : 1;
      try {
        const rows = await sb(`/tracks?id=eq.${encodeURIComponent(id)}&select=${col}`);
        const cur = Math.max(0, (rows?.[0]?.[col] || 0) + delta);
        await sb(`/tracks?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ [col]: cur }) });
        return res.status(200).json({ success: true, [col]: cur, source: "supabase" });
      } catch (e) {
        const idx = _mem.findIndex((t) => t.id === id);
        if (idx >= 0) {
          _mem[idx][col] = Math.max(0, (_mem[idx][col] || 0) + delta);
          return res.status(200).json({ success: true, [col]: _mem[idx][col], source: "memory" });
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
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
