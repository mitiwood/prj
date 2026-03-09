export default function handler(req, res) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const redirectUri = 'https://ai-music-studio-bice.vercel.app/api/auth/naver/callback';
  const state = Math.random().toString(36).substring(2);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  res.redirect(`https://nid.naver.com/oauth2.0/authorize?${params}`);
}
