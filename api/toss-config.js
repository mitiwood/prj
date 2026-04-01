// /api/toss-config.js — 토스 공개키 + 플랜 정의 (Single Source of Truth)
//
// 플랜 정의는 이 파일에서만 관리합니다.
// 프론트엔드는 /api/toss-config GET으로 fetch하여 사용합니다.

/* 환경변수 없으면 토스 공식 테스트 키 사용 (실결제 안 됨) */
const TOSS_CLIENT_KEY = process.env.TOSS_CLIENT_KEY || "test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq";

export const PLANS = {
  free: {
    price: 0,
    period: "월",
    label: "Free",
    icon: "🆓",
    color: "var(--t3)",
    desc: "월 5곡 무료 생성",
    limits: { songs: 5, mv: 0, lyrics: 5 },
    features: ["AI 작곡 5곡/월", "V3.5 모델", "1분 제한", "MP3 다운로드"],
  },
  pro: {
    price: 9900,
    period: "월",
    label: "Pro",
    icon: "💜",
    color: "var(--acc2)",
    desc: "월 50곡 + MV + 보컬변환",
    limits: { songs: 50, mv: 3, lyrics: 50 },
    features: [
      "AI 작곡 50곡/월",
      "V3.5 ~ V4.5 모델",
      "3분까지 생성",
      "MP3/WAV 다운로드",
      "뮤직비디오 3개/월",
      "보컬 변환",
      "커뮤니티 공유",
      "우선 생성 큐",
    ],
  },
  creator: {
    price: 19900,
    period: "월",
    label: "Creator",
    icon: "👑",
    color: "#f59e0b",
    desc: "무제한 생성 + 상업 라이선스",
    limits: { songs: 999, mv: 20, lyrics: 999 },
    features: [
      "무제한 AI 작곡",
      "전체 모델 (V4.5+ 포함)",
      "8분까지 생성",
      "MP3/WAV/FLAC 다운로드",
      "뮤직비디오 20개/월",
      "보컬 변환",
      "커뮤니티 공유",
      "최우선 생성 큐",
      "상업적 이용 라이선스",
    ],
  },
  supervisor: {
    price: 0,
    period: "무기한",
    label: "Supervisor",
    icon: "⭐",
    color: "#ef4444",
    desc: "슈퍼바이저 — 모든 기능 무제한",
    limits: { songs: 9999, mv: 9999, lyrics: 9999 },
    features: [
      "모든 기능 무제한",
      "전체 모델 접근",
      "관리자 권한",
    ],
  },
};

/* 크레딧 팩 (일회성 구매) */
export const CREDIT_PACKS = {
  pack10: { price: 1900, credits: 10, label: "10곡 팩" },
  pack30: { price: 4900, credits: 30, label: "30곡 팩" },
  pack100: { price: 12900, credits: 100, label: "100곡 팩" },
};

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method not allowed" });
  }

  return res.status(200).json({
    ok: true,
    clientKey: TOSS_CLIENT_KEY,
    plans: PLANS,
    creditPacks: CREDIT_PACKS,
  });
}
