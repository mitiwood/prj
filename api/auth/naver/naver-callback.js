export default async function handler(req, res) {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/?login=fail');

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const redirectUri = 'https://ai-music-studio-bice.vercel.app/api/auth/naver/callback';

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
      avatar: user.profile_image || '',
      id: user.id || '',
    });
    res.redirect(`/?${params}`);
  } catch(e) {
    console.error('Naver callback error:', e);
    res.redirect('/?login=fail');
  }
}
