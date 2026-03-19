/**
 * /api/cron/status — 30분마다 서버 상태 + 신규 트랙/댓글 텔레그램 알림
 * Vercel Cron Job으로 자동 실행
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "";
const CRON_SECRET = process.env.CRON_SECRET || process.env.ADMIN_SECRET || "kenny2024!";

async function sb(path) {
  if (!SB_URL || !SB_KEY) throw new Error("no_supabase");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`${SB_URL}/rest/v1${path}`, {
      signal: controller.signal,
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json; charset=utf-8",
      },
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(`SB ${r.status}`);
    return txt ? JSON.parse(txt) : [];
  } finally {
    clearTimeout(timeout);
  }
}

async function tgSend(text) {
  if (!TG_TOKEN || !TG_CHAT) return false;
  const controller = new AbortController();
  const tm = setTimeout(() => controller.abort(), 8000);
  try {
    const body = Buffer.from(JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: "Markdown" }), "utf-8");
    const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": String(body.length) },
      body,
    });
    const d = await r.json();
    return d.ok;
  } catch(e) { console.warn("[TG cron]", e.message); return false; }
  finally { clearTimeout(tm); }
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  /* Vercel Cron 인증 또는 ADMIN 인증 */
  const cronAuth = req.headers["authorization"]?.replace("Bearer ", "");
  const vercelCron = req.headers["x-vercel-cron"]; /* Vercel이 자동 추가 */
  if (!vercelCron && cronAuth !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!TG_TOKEN || !TG_CHAT) {
    return res.status(400).json({ error: "텔레그램 봇 미설정" });
  }

  const ts = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const since30m = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  let report = `📊 *서버 상태 리포트*\n⏰ ${ts}\n\n`;
  let hasNews = false;

  try {
    /* 1. 전체 트랙 수 */
    const allTracks = await sb("/tracks?select=id&limit=1000");
    const publicTracks = await sb("/tracks?is_public=eq.true&select=id&limit=1000");
    report += `🎵 전체 트랙: *${allTracks.length}*곡 (공개: ${publicTracks.length})\n`;

    /* 2. 최근 30분 신규 트랙 */
    const newTracks = await sb(`/tracks?created_at=gte.${since30m}&order=created_at.desc&select=id,title,owner_name,gen_mode,created_at&limit=10`);
    if (newTracks.length) {
      hasNews = true;
      report += `\n🆕 *신규 트랙* (${newTracks.length}곡)\n`;
      newTracks.forEach((t, i) => {
        const time = new Date(t.created_at).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
        report += `  ${i + 1}. ${t.title || "무제"} (${t.owner_name || "익명"}) ${time}\n`;
      });
    }

    /* 3. 최근 30분 신규 댓글 */
    try {
      const newComments = await sb(`/comments?created_at=gte.${since30m}&order=created_at.desc&select=id,track_id,author_name,content,created_at&limit=10`);
      if (newComments.length) {
        hasNews = true;
        report += `\n💬 *신규 댓글* (${newComments.length}개)\n`;
        newComments.forEach((c, i) => {
          const preview = (c.content || "").slice(0, 30) + ((c.content || "").length > 30 ? "..." : "");
          report += `  ${i + 1}. ${c.author_name || "익명"}: ${preview}\n`;
        });
      }
    } catch (e) { /* comments 테이블 없으면 무시 */ }

    /* 4. 전체 사용자 수 */
    try {
      const users = await sb("/users?select=id&limit=1000");
      report += `\n👥 가입 사용자: *${users.length}*명\n`;
    } catch (e) {}

    /* 5. 서버 상태 */
    report += `\n✅ Supabase: 정상`;
    report += `\n✅ Vercel: 정상`;
    report += `\n🔗 https://ai-music-studio-bice.vercel.app`;

    if (!hasNews) {
      report += `\n\n💤 최근 30분간 새 활동 없음`;
    }

    /* 전송 */
    const sent = await tgSend(report);
    return res.status(200).json({ success: sent, report, hasNews });

  } catch (e) {
    const errReport = `⚠️ *서버 상태 이상*\n⏰ ${ts}\n\n❌ 오류: ${e.message}\n\n점검이 필요합니다.`;
    await tgSend(errReport);
    return res.status(200).json({ success: true, error: e.message });
  }
}
