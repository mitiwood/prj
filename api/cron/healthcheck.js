/**
 * /api/cron/healthcheck — 매일 오전 9시 API 헬스체크 + 텔레그램 리포트
 * Vercel Cron Job으로 자동 실행
 */

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT  = process.env.TELEGRAM_CHAT_ID || "";
const CRON_SECRET = process.env.CRON_SECRET || process.env.ADMIN_SECRET || "kenny2024!";
const BASE_URL = "https://ai-music-studio-bice.vercel.app";

const ENDPOINTS = [
  { path: "/api/tracks?public=true&limit=1", label: "/api/tracks" },
  { path: "/api/users",                      label: "/api/users" },
  { path: "/api/comments",                   label: "/api/comments" },
  { path: "/api/announcement",               label: "/api/announcement" },
  { path: "/api/kie-proxy",                  label: "/api/kie-proxy", method: "OPTIONS" },
  { path: "/api/payments/confirm",           label: "/api/payments", method: "OPTIONS" },
];

async function checkEndpoint(ep) {
  const url = `${BASE_URL}${ep.path}`;
  const method = ep.method || "GET";
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(url, { method, signal: controller.signal });
    clearTimeout(timeout);
    const ms = Date.now() - start;
    return { label: ep.label, status: r.status, ms, ok: r.status >= 200 && r.status < 500 };
  } catch (e) {
    const ms = Date.now() - start;
    return { label: ep.label, status: "TIMEOUT", ms, ok: false, error: e.message };
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
  } catch (e) { return false; }
  finally { clearTimeout(tm); }
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  /* 인증 */
  const cronAuth = req.headers["authorization"]?.replace("Bearer ", "");
  const vercelCron = req.headers["x-vercel-cron"];
  if (!vercelCron && cronAuth !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!TG_TOKEN || !TG_CHAT) {
    return res.status(400).json({ error: "텔레그램 봇 미설정" });
  }

  const ts = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const results = await Promise.all(ENDPOINTS.map(checkEndpoint));
  const okCount = results.filter(r => r.ok).length;
  const total = results.length;
  const allOk = okCount === total;

  let report = `🏥 *매일 API 헬스체크 리포트*\n📅 ${ts}\n\n`;

  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    report += `${icon} \`${r.label}\` — ${r.status} (${r.ms}ms)\n`;
  }

  report += `\n*전체: ${okCount}/${total} 정상*`;

  if (!allOk) {
    const failed = results.filter(r => !r.ok);
    report += `\n\n⚠️ *장애 감지!*\n`;
    failed.forEach(r => {
      report += `❌ ${r.label}: ${r.status} ${r.error || ""}\n`;
    });
    report += `\n즉시 점검이 필요합니다.`;
  } else {
    report += `\n\n🟢 모든 API 정상 작동 중`;
  }

  report += `\n🔗 ${BASE_URL}`;

  const sent = await tgSend(report);
  return res.status(200).json({ success: sent, results, okCount, total });
}
