// /api/toss-config.js — 토스 공개키 + 플랜 정의 (프론트엔드용)

const TOSS_CLIENT_KEY = process.env.TOSS_CLIENT_KEY;

const PLANS = {
  free: {
    price: 0,
    credits: 2,
    period: "일",
    label: "Free",
    desc: "하루 2곡 생성",
    features: ["AI 작곡 2곡/일", "기본 장르", "MP3 다운로드"],
  },
  basic: {
    price: 4900,
    credits: 30,
    period: "월",
    label: "Basic",
    desc: "월 30곡 생성",
    features: ["AI 작곡 30곡/월", "전체 장르", "MP3/WAV 다운로드", "커뮤니티 공유"],
  },
  pro: {
    price: 9900,
    credits: 100,
    period: "월",
    label: "Pro",
    desc: "월 100곡 + MV + 보컬변환",
    features: [
      "AI 작곡 100곡/월",
      "전체 장르",
      "MP3/WAV/FLAC 다운로드",
      "뮤직비디오 생성",
      "보컬 변환",
      "커뮤니티 공유",
      "우선 생성 큐",
    ],
  },
  unlimited: {
    price: 19900,
    credits: 999999,
    period: "월",
    label: "Unlimited",
    desc: "무제한 생성",
    features: [
      "무제한 AI 작곡",
      "전체 장르",
      "MP3/WAV/FLAC 다운로드",
      "뮤직비디오 생성",
      "보컬 변환",
      "커뮤니티 공유",
      "최우선 생성 큐",
      "상업적 이용 라이선스",
    ],
  },
};

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method not allowed" });
  }

  return res.status(200).json({
    ok: true,
    clientKey: TOSS_CLIENT_KEY,
    plans: PLANS,
  });
}
