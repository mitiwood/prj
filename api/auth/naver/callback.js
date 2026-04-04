export default async function handler(req, res) {
  const { code, error, state } = req.query;
  const APP_URL = 'https://ddinggok.com';
  if (error || !code) return res.redirect(`${APP_URL}/?login=fail`);

  /* CSRF state 검증 */
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')));
  const savedState = cookies.oauth_state;
  if (!state || !savedState || state !== savedState) {
    console.error('[naver-callback] CSRF state 불일치');
    return res.redirect(`${APP_URL}/?login=fail`);
  }
  /* state 쿠키 제거 */
  res.setHeader('Set-Cookie', 'oauth_state=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0');

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const redirectUri = 'https://ddinggok.com/api/auth/naver/callback';

  try {
    const tokenRes = await fetch('https://nid.naver.com/oauth2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
        state,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('token 실패');

    const userRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();
    const user = userData.response;

    const params = new URLSearchParams({
      login: 'ok',
      provider: 'naver',
      name: user.name || user.nickname || '',
      email: user.email || '',
      avatar: (user.profile_image || '').replace(/^http:\/\//i, 'https://'),
      id: user.id || '',
    });
    res.redirect(`${APP_URL}/?${params}`);
  } catch(e) {
    console.error('[naver-callback] 에러:', e.message);
    res.redirect(`${APP_URL}/?login=fail`);
  }
}
