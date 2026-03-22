/**
 * /api/tg-report — 텔레그램 봇으로 작업 리포트 전송
 * GET ?msg=메시지 (관리자 인증 필요)
 * POST body: {msg} (관리자 인증 필요)
 */

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "";
const ADMIN_PWD = process.env.ADMIN_SECRET;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = (req.headers.authorization || "").replace("Bearer ", "");
  if (auth !== ADMIN_PWD) return res.status(401).json({ error: "Unauthorized" });

  if (!TG_TOKEN || !TG_CHAT) {
    return res.status(400).json({
      error: "텔레그램 봇 미설정",
      help: "Vercel 환경변수에 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID를 설정하세요.",
      setup: [
        "1. @BotFather에서 봇 생성 → 토큰 복사",
        "2. 봇에게 /start 메시지 전송",
        "3. https://api.telegram.org/bot{TOKEN}/getUpdates 에서 chat_id 확인",
        "4. Vercel 대시보드 → Settings → Environment Variables에 추가:",
        "   TELEGRAM_BOT_TOKEN = 봇 토큰",
        "   TELEGRAM_CHAT_ID = 채팅 ID",
        "5. Vercel 재배포 후 이 API 다시 호출",
      ],
    });
  }

  let msg = req.query?.msg || "";
  if (req.method === "POST") {
    let b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
    msg = b?.msg || msg;
  }
  if (!msg) msg = "테스트 메시지";

  try {
    const jsonBody = Buffer.from(JSON.stringify({ chat_id: TG_CHAT, text: msg,  }), "utf-8");
    const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": String(jsonBody.length) },
      body: jsonBody,
    });
    const d = await r.json();
    if (d.ok) {
      return res.status(200).json({ success: true, message_id: d.result?.message_id });
    } else {
      return res.status(400).json({ error: d.description || "전송 실패" });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
