export default async function handler(req, res) {
  const { code, error } = req.query;
  const APP_URL = 'https://ddinggok.com';
  if (error || !code) return res.redirect(`${APP_URL}/?login=fail`);
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
    if (!tokenData.access_token) throw new Error('token ����');
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userRes.json();
    const params = new URLSearchParams({
      login: 'ok', provider: 'google',
      name: user.name || '', email: user.email || '',
      avatar: user.picture || '', id: user.id || '',
    });
    res.redirect(`${APP_URL}/?${params}`);
  } catch(e) {
    res.redirect(`${APP_URL}/?login=fail`);
  }
}
