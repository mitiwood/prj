/**
 * /api/config — 클라이언트 설정 전달
 * Vercel 환경변수: KIE_API_KEY, KAKAO_JS_KEY
 */
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query?.type;

  /* 카카오 JS 키만 요청 */
  if (type === 'kakao') {
    return res.status(200).json({ kakaoJsKey: process.env.KAKAO_JS_KEY || '' });
  }

  const apiKey = process.env.KIE_API_KEY || '';

  if (!apiKey) {
    return res.status(500).json({ error: 'KIE_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  return res.status(200).json({ apiKey });
}
