// /api/payments/confirm.js — Toss Payments 승인 + 결제 내역 조회

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const TOSS_SECRET = process.env.TOSS_SECRET_KEY || "test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-admin-key");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") return res.status(200).end();

  /* ── GET: 결제 내역 (관리자 전용) ── */
  if (req.method === "GET") {
    const auth = req.headers["x-admin-key"] || req.query.key;
    if (auth !== ADMIN_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    try {
      const r = await sb(
        `/payments?select=*&order=created_at.desc&limit=${limit}&offset=${offset}`
      );
      const data = await r.json();
      /* Supabase 에러 체크 (테이블 미존재 등) */
      if (!r.ok || data?.code) {
        return res.status(200).json({ ok: true, payments: [], error: data?.message || 'payments 테이블 없음' });
      }
      return res.status(200).json({ ok: true, payments: Array.isArray(data) ? data : [] });
    } catch (e) {
      return res.status(200).json({ ok: true, payments: [], error: e.message });
    }
  }

  /* ── POST: 결제 승인 ── */
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  const { paymentKey, orderId, amount, plan, userName, userProvider } = req.body || {};

  if (!paymentKey || !orderId || !amount || !plan) {
    return res.status(400).json({ error: "missing required fields" });
  }

  // 금액 검증
  const planDef = PLANS[plan];
  if (!planDef || planDef.price !== amount) {
    return res.status(400).json({ error: "invalid plan or amount mismatch" });
  }

  try {
    /* 1) Toss 결제 승인 API 호출 */
    const basicAuth = Buffer.from(`${TOSS_SECRET}:`).toString("base64");
    const tossRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });

    const tossData = await tossRes.json();

    if (!tossRes.ok) {
      console.error("[payments/confirm] Toss error:", tossData);
      return res.status(tossRes.status).json({
        error: tossData.message || "payment confirmation failed",
        code: tossData.code,
      });
    }

    /* 2) Supabase payments 테이블에 저장 */
    const paymentRow = {
      order_id: orderId,
      user_name: userName || null,
      user_provider: userProvider || null,
      payment_key: paymentKey,
      amount,
      plan,
      status: tossData.status || "DONE",
      method: tossData.method || null,
      approved_at: tossData.approvedAt || new Date().toISOString(),
    };

    const insertRes = await sb("/payments", {
      method: "POST",
      body: JSON.stringify(paymentRow),
    });

    if (!insertRes.ok) {
      const err = await insertRes.text();
      console.error("[payments/confirm] DB insert error:", err);
      // 결제는 이미 승인됨 — DB 저장 실패해도 승인 결과는 반환
    }

    /* 3) 사용자 플랜/크레딧 업데이트 */
    if (userName && userProvider) {
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      const updateRes = await sb(
        `/users?name=ilike.${encodeURIComponent(userName)}&provider=eq.${encodeURIComponent(userProvider)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            plan,
            credits: planDef.credits,
            plan_expires: expiresAt.toISOString(),
          }),
        }
      );

      if (!updateRes.ok) {
        const err = await updateRes.text();
        console.error("[payments/confirm] User update error:", err);
      }
    }

    return res.status(200).json({
      ok: true,
      payment: {
        orderId,
        amount,
        plan,
        status: tossData.status,
        method: tossData.method,
        approvedAt: tossData.approvedAt,
      },
    });
  } catch (err) {
    console.error("[payments/confirm] Unexpected error:", err);
    return res.status(500).json({ error: "internal server error" });
  }
}
