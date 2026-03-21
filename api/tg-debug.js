// 텔레그램 환경변수 디버깅 + 직접 발송 테스트
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = (process.env.TELEGRAM_CHAT_ID || "").trim();
const ADMIN_SECRET = process.env.ADMIN_SECRET || "kenny2024!";

export default async function handler(req, res) {
  const auth = (req.headers.authorization || "").replace("Bearer ", "");
  if (auth !== ADMIN_SECRET) return res.status(401).json({ error: "unauthorized" });

  // 환경변수 상태 확인
  const status = {
    token: TG_TOKEN ? "set (" + TG_TOKEN.slice(0, 8) + "...)" : "EMPTY",
    chat: TG_CHAT || "EMPTY",
    tokenLen: TG_TOKEN.length,
    chatLen: TG_CHAT.length,
  };

  // 직접 발송 테스트
  if (req.query?.send === "1") {
    const text = "🔧 *텔레그램 디버그 테스트*\ntoken: " + (TG_TOKEN ? "OK" : "EMPTY") + "\nchat: " + TG_CHAT;
    try {
      const body = Buffer.from(JSON.stringify({ chat_id: TG_CHAT, text,  }), "utf-8");
      const r = await fetch("https://api.telegram.org/bot" + TG_TOKEN + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": String(body.length) },
        body,
      });
      const d = await r.json();
      return res.status(200).json({ ...status, sendResult: d });
    } catch (e) {
      return res.status(200).json({ ...status, sendError: e.message });
    }
  }

  return res.status(200).json(status);
}
