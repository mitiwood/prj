export default async function handler(req, res) {
  const { code, error, state } = req.query;
  const APP_URL = 'https://ddinggok.com';
  if (error || !code) return res.redirect(`${APP_URL}/?login=fail`);

  /* CSRF state 검증 */
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')));
  const savedState = cookies.oauth_state;
  if (!state || !savedState || state !== savedState) {
    console.error('[google-callback] CSRF state 불일치');
    return res.redirect(`${APP_URL}/?login=fail`);
  }
  /* state 쿠키 제거 */
  res.setHeader('Set-Cookie', 'oauth_state=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0');

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = 'https://ddinggok.com/api/auth/google/callback';
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('token 실패');
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userRes.json();
    const params = new URLSearchParams({
      login: 'ok', provider: 'google',
      name: user.name || '', email: user.email || '',
      avatar: (user.picture || '').replace(/^http:\/\//i, 'https://'), id: user.id || '',
    });
    res.redirect(`${APP_URL}/?${params}`);
  } catch(e) {
    console.error('[google-callback] 에러:', e.message);
    res.redirect(`${APP_URL}/?login=fail`);
  }
}
