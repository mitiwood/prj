// api/auth/kakao/index.js
// 카카오 OAuth 시작 — 카카오 인증 페이지로 리디렉트
import crypto from 'crypto';

const APP_URL = 'https://ddinggok.com';

export default function handler(req, res) {
  const clientId = process.env.KAKAO_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'KAKAO_CLIENT_ID 환경변수 없음' });

  const redirectUri = `${APP_URL}/api/auth/kakao/callback`;
  const state = crypto.randomBytes(20).toString('hex');

  res.setHeader('Set-Cookie', `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600`);

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    state,
  });

  res.redirect(`https://kauth.kakao.com/oauth/authorize?${params}`);
}
