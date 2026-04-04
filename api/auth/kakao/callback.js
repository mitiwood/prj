// api/auth/kakao/callback.js
// 카카오 OAuth 콜백 — 코드 교환 → 사용자 정보 → /?login=ok 리디렉트
const APP_URL = 'https://ddinggok.com';

export default async function handler(req, res) {
  const { code, error, state } = req.query;

  if (error || !code) {
    console.error('[kakao-callback] 오류:', error);
    return res.redirect(`${APP_URL}/?login=fail`);
  }

  /* CSRF state 검증 */
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')));
  const savedState = cookies.oauth_state;
  if (!state || !savedState || state !== savedState) {
    console.error('[kakao-callback] CSRF state 불일치');
    return res.redirect(`${APP_URL}/?login=fail`);
  }
  /* state 쿠키 제거 */
  res.setHeader('Set-Cookie', 'oauth_state=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0');

  const clientId     = process.env.KAKAO_CLIENT_ID;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  const redirectUri  = `${APP_URL}/api/auth/kakao/callback`;

  try {
    // 1. 인가 코드 → Access Token
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     clientId,
        client_secret: clientSecret || '',
        redirect_uri:  redirectUri,
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error(tokenData.error_description || JSON.stringify(tokenData));

    // 2. Access Token → 사용자 정보
    const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const kakaoUser = await userRes.json();
    if (!kakaoUser.id) throw new Error('카카오 사용자 정보 조회 실패');

    const profile = kakaoUser.kakao_account?.profile || kakaoUser.properties || {};
    const name    = profile.nickname || '카카오사용자';
    const email   = kakaoUser.kakao_account?.email || '';
    const avatar  = (profile.profile_image_url || profile.thumbnail_image_url || '').replace(/^http:\/\//i, 'https://');

    const params = new URLSearchParams({
      login: 'ok', provider: 'kakao',
      name, email, avatar,
      id: String(kakaoUser.id),
    });
    return res.redirect(`${APP_URL}/?${params}`);

  } catch (e) {
    console.error('[kakao-callback] 에러:', e.message);
    return res.redirect(`${APP_URL}/?login=fail`);
  }
}
