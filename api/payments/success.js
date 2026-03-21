// /api/payments/success.js — 토스 결제 성공 리다이렉트 핸들러
// 토스가 successUrl로 리다이렉트하면 여기서 서버 승인 후 프론트로 보냄

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const TOSS_SECRET = process.env.TOSS_SECRET_KEY || "test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R";
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = (process.env.TELEGRAM_CHAT_ID || "").trim();

async function _tgNotify(text) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    const body = Buffer.from(JSON.stringify({ chat_id: TG_CHAT, text,  }), "utf-8");
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": String(body.length) },
      body,
    });
  } catch(e) { console.warn("[TG]", e.message); }
}

async function _kakaoNotify(text) {
  try {
    await fetch('https://ai-music-studio-bice.vercel.app/api/kakao-notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch {}
}

const PLANS = {
  basic:     { price: 4900,  credits: 30,  label: "Basic" },
  pro:       { price: 9900,  credits: 100, label: "Pro" },
  unlimited: { price: 19900, credits: 999999, label: "Unlimited" },
};

async function sb(path, opts = {}) {
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
        Prefer: opts.prefer || "return=representation",
        ...(opts.headers || {}),
      },
    });
    return r;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  const { paymentKey, orderId, amount, plan, userName, userProvider } = req.query;

  if (!paymentKey || !orderId || !amount) {
    return res.redirect(`/?payment=fail&message=${encodeURIComponent('결제 정보 누락')}`);
  }

  const numAmount = parseInt(amount);
  const planDef = PLANS[plan];

  if (!planDef || planDef.price !== numAmount) {
    return res.redirect(`/?payment=fail&message=${encodeURIComponent('금액 불일치')}`);
  }

  try {
    /* 1) 토스 결제 승인 */
    const basicAuth = Buffer.from(`${TOSS_SECRET}:`).toString("base64");
    const tossRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentKey, orderId, amount: numAmount }),
    });

    const tossData = await tossRes.json();

    if (!tossRes.ok) {
      console.error("[payments/success] Toss error:", tossData);
      return res.redirect(`/?payment=fail&message=${encodeURIComponent(tossData.message || '승인 실패')}`);
    }

    /* 2) DB 저장 */
    try {
      await sb("/payments", {
        method: "POST",
        body: JSON.stringify({
          order_id: orderId,
          user_name: userName || null,
          user_provider: userProvider || null,
          payment_key: paymentKey,
          amount: numAmount,
          plan,
          status: tossData.status || "DONE",
          method: tossData.method || null,
          approved_at: tossData.approvedAt || new Date().toISOString(),
        }),
      });
    } catch (e) {
      console.error("[payments/success] DB insert error:", e);
    }

    /* 3) 사용자 플랜 업데이트 */
    if (userName && userProvider) {
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);
      try {
        await sb(
          `/users?name=eq.${encodeURIComponent(userName)}&provider=eq.${encodeURIComponent(userProvider)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              plan,
              credits: planDef.credits,
              plan_expires: expiresAt.toISOString(),
            }),
          }
        );
      } catch (e) {
        console.error("[payments/success] User update error:", e);
      }
    }

    /* 4) 텔레그램 알림 */
    const ts = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const payMsg = `💰 결제 완료\n플랜: ${planDef.label} (₩${numAmount.toLocaleString()})\n사용자: ${userName || '알 수 없음'}\n결제수단: ${tossData.method || '-'}\n주문번호: ${orderId}\n⏰ ${ts}`;
    await Promise.allSettled([_tgNotify(`💰 *결제 완료*\n플랜: ${planDef.label} (₩${numAmount.toLocaleString()})\n사용자: ${userName || '알 수 없음'}\n결제수단: ${tossData.method || '-'}\n주문번호: ${orderId}\n⏰ ${ts}`), _kakaoNotify(payMsg)]);

    /* 5) 프론트로 리다이렉트 */
    return res.redirect(`/?payment=success&plan=${plan}`);

  } catch (err) {
    console.error("[payments/success] Unexpected error:", err);
    return res.redirect(`/?payment=fail&message=${encodeURIComponent('서버 오류')}`);
  }
}
