/**
 * /api/vapid-keys — VAPID 공개키 반환 (클라이언트용 raw 포맷)
 * Vercel 환경변수 VAPID_PUBLIC_KEY 가 SPKI(DER) 포맷이면 자동으로 raw로 변환
 */
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=86400');

  let publicKey = process.env.VAPID_PUBLIC_KEY || '';

  if (!publicKey) {
    return res.status(200).json({ publicKey: '' });
  }

  try {
    // base64url → Buffer
    const pad = '='.repeat((4 - publicKey.length % 4) % 4);
    const raw = Buffer.from(
      publicKey.replace(/-/g, '+').replace(/_/g, '/') + pad,
      'base64'
    );

    // SPKI 포맷(91바이트)이면 마지막 65바이트(raw uncompressed point)만 추출
    if (raw.length === 91) {
      const point = raw.slice(26); // 04 || x(32) || y(32)
      publicKey = point.toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }
    // 이미 65바이트 raw라면 그대로 사용
  } catch (e) {
    console.error('[vapid-keys] key conversion error:', e.message);
  }

  return res.status(200).json({ publicKey });
}
