import crypto from 'crypto';

export default function handler(req, res) {
  const clientId = process.env.NAVER_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'NAVER_CLIENT_ID 환경변수 없음' });

  const redirectUri = 'https://ddinggok.com/api/auth/naver/callback';
  const state = crypto.randomBytes(20).toString('hex');

  res.setHeader('Set-Cookie', `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600`);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  res.redirect(`https://nid.naver.com/oauth2.0/authorize?${params}`);
}
