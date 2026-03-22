/**
 * /api/push-subscribe — 구독 정보 저장
 * Vercel KV 없이 간단히 환경변수 기반으로 처리
 * (실 운영 시 Vercel KV 또는 Supabase로 교체 권장)
 */
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { subscription, userInfo } = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription' });

    // 구독 정보를 응답으로 반환 (클라이언트 localStorage에 저장)
    // 실제 서비스에서는 DB에 저장 필요

    return res.status(200).json({
      success: true, 
      message: '푸시 알림이 등록되었습니다',
      endpoint: subscription.endpoint.slice(-30)
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
