/**
 * /api/push-subscribe — 구독 정보 저장 (Supabase)
 * POST body: { subscription: PushSubscription, userInfo: {name, provider, ...} }
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { subscription, userInfo } = req.body || {};
    if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription' });

    const name = userInfo?.name || '';
    const provider = userInfo?.provider || '';

    /* Supabase에 구독 정보 upsert */
    if (SB_URL && SB_KEY && name && provider) {
      try {
        await fetch(`${SB_URL}/rest/v1/push_subscriptions?on_conflict=user_name,user_provider`, {
          method: 'POST',
          headers: {
            apikey: SB_KEY,
            Authorization: `Bearer ${SB_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            user_name: name,
            user_provider: provider,
            subscription: subscription,
          }),
        });
      } catch (e) {
        console.warn('[push-subscribe] Supabase upsert failed:', e.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: '푸시 알림이 등록되었습니다',
      endpoint: subscription.endpoint.slice(-30),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
