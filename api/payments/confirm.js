// /api/payments/confirm.js — Toss Payments 승인 + 결제 내역 조회
// 플랜 정의는 toss-config.js에서 import (Single Source of Truth)

import { PLANS, CREDIT_PACKS } from '../toss-config.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const TOSS_SECRET = process.env.TOSS_SECRET_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

/* 플랜/크레딧팩 통합 조회 — plan 또는 credit_pack 키로 검색 */
function findPlanOrPack(key) {
  if (PLANS[key]) return { price: PLANS[key].price, credits: PLANS[key].limits?.songs || 0, label: PLANS[key].label };
  if (CREDIT_PACKS[key]) return { price: CREDIT_PACKS[key].price, credits: CREDIT_PACKS[key].credits, label: CREDIT_PACKS[key].label };
  return null;
}

async function sb(path, opts = {}) {
  if (!SB_URL || !SB_KEY) return null;
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

  if (!TOSS_SECRET) {
    return res.status(500).json({ error: "TOSS_SECRET_KEY 환경변수 미설정" });
  }

  const { paymentKey, orderId, amount, plan, userName, userProvider } = req.body || {};

  if (!paymentKey || !orderId || !amount || !plan) {
    return res.status(400).json({ error: "missing required fields" });
  }

  // 금액 검증 (플랜 + 크레딧팩 모두 지원)
  const planDef = findPlanOrPack(plan);
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

    /* 3) 사용자 플랜/크레딧 업데이트 — 결과 검증 포함 */
    if (userName && userProvider) {
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);
      const planBody = {
        plan,
        credits_song: PLANS[plan]?.limits?.songs || planDef.credits,
        credits_mv: PLANS[plan]?.limits?.mv || 0,
        credits_lyrics: PLANS[plan]?.limits?.lyrics || planDef.credits,
        plan_expires: expiresAt.toISOString(),
      };

      const updateRes = await sb(
        `/users?name=ilike.${encodeURIComponent(userName)}&provider=eq.${encodeURIComponent(userProvider)}`,
        { method: "PATCH", body: JSON.stringify(planBody) }
      );
      const updateData = await updateRes.json().catch(() => []);

      if (!updateRes.ok) {
        console.error("[payments/confirm] User update error:", JSON.stringify(updateData));
      } else if (!Array.isArray(updateData) || updateData.length === 0) {
        /* ilike 매칭 실패 — eq로 재시도 */
        console.warn("[payments/confirm] ilike PATCH matched 0 rows, retrying with eq...");
        const retryRes = await sb(
          `/users?name=eq.${encodeURIComponent(userName)}&provider=eq.${encodeURIComponent(userProvider)}`,
          { method: "PATCH", body: JSON.stringify(planBody) }
        );
        const retryData = await retryRes.json().catch(() => []);
        if (!Array.isArray(retryData) || retryData.length === 0) {
          console.error("[payments/confirm] User not found for plan update:", userName, userProvider);
        }
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
