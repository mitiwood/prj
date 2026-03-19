// /api/payments/webhook.js — Toss Payments 웹훅 수신

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const WEBHOOK_SECRET = process.env.TOSS_WEBHOOK_SECRET;

async function sb(path, opts = {}) {
  const r = await fetch(`${SB_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json; charset=utf-8",
      Prefer: opts.prefer || "return=representation",
      ...(opts.headers || {}),
    },
  });
  return r;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  /* ── 웹훅 시크릿 검증 ── */
  const sig = req.headers["toss-signature"] || req.headers["x-toss-signature"];
  if (WEBHOOK_SECRET && sig !== WEBHOOK_SECRET) {
    console.warn("[webhook] Invalid signature");
    return res.status(401).json({ error: "invalid signature" });
  }

  const event = req.body;
  if (!event || !event.data) {
    return res.status(400).json({ error: "empty payload" });
  }

  const { eventType, data } = event;
  const paymentKey = data.paymentKey;
  const status = data.status; // DONE, CANCELED, PARTIAL_CANCELED, ABORTED, EXPIRED 등

  console.log(`[webhook] eventType=${eventType} paymentKey=${paymentKey} status=${status}`);

  try {
    /* ── payments 테이블 상태 업데이트 ── */
    if (paymentKey && status) {
      const patchBody = { status };

      // 취소인 경우 취소 정보도 기록
      if (data.cancels && data.cancels.length > 0) {
        patchBody.cancel_reason = data.cancels[0].cancelReason || null;
        patchBody.canceled_at = data.cancels[0].canceledAt || new Date().toISOString();
      }

      const updateRes = await sb(
        `/payments?payment_key=eq.${encodeURIComponent(paymentKey)}`,
        {
          method: "PATCH",
          body: JSON.stringify(patchBody),
        }
      );

      if (!updateRes.ok) {
        const err = await updateRes.text();
        console.error("[webhook] payment update error:", err);
      }

      /* ── 취소 시 사용자 플랜 다운그레이드 ── */
      if (status === "CANCELED" || status === "ABORTED" || status === "EXPIRED") {
        // 결제 행에서 user 정보 조회
        const paymentRes = await sb(
          `/payments?payment_key=eq.${encodeURIComponent(paymentKey)}&select=user_name,user_provider&limit=1`
        );
        const payments = await paymentRes.json();

        if (payments && payments.length > 0) {
          const { user_name, user_provider } = payments[0];
          if (user_name && user_provider) {
            await sb(
              `/users?name=eq.${encodeURIComponent(user_name)}&provider=eq.${encodeURIComponent(user_provider)}`,
              {
                method: "PATCH",
                body: JSON.stringify({
                  plan: "free",
                  credits: 2,
                  plan_expires: null,
                }),
              }
            );
          }
        }
      }
    }

    // Toss는 200 응답을 기대
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[webhook] Unexpected error:", err);
    // 웹훅은 재시도되므로 500 반환
    return res.status(500).json({ error: "internal error" });
  }
}
