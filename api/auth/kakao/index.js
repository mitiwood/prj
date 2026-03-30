// api/auth/kakao/index.js
// 카카오 OAuth 시작 — 카카오 인증 페이지로 리디렉트
const APP_URL = 'https://ddinggok.com';

export default function handler(req, res) {
  const clientId = process.env.KAKAO_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'KAKAO_CLIENT_ID 환경변수 없음' });

  // Vercel 폴더 라우팅: /api/auth/kakao → /api/auth/kakao/callback
  const redirectUri = `${APP_URL}/api/auth/kakao/callback`;

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
  });

  res.redirect(`https://kauth.kakao.com/oauth/authorize?${params}`);
}
