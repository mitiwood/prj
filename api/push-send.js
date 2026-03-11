/**
 * /api/push-send — 관리자 푸시 발송
 * Authorization: Bearer {ADMIN_SECRET} 필요
 * Vercel 환경변수: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, ADMIN_SECRET
 */
import webpush from 'web-push';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 관리자 인증
  const auth = req.headers.authorization;
  const adminSecret = process.env.ADMIN_SECRET || 'kenny2024!';
  if (!auth || auth !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { subscriptions, title, body, url, icon } = req.body;
  if (!subscriptions?.length) return res.status(400).json({ error: 'No subscriptions' });

  const vapidPublic  = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublic || !vapidPrivate) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }

  webpush.setVapidDetails(
    'mailto:admin@ai-music-studio.app',
    vapidPublic,
    vapidPrivate
  );

  const payload = JSON.stringify({
    title: title || 'Kenny\'s Music Studio',
    body:  body  || '새로운 소식이 있어요 🎵',
    icon:  icon  || '/icon-192.png',
    url:   url   || 'https://ai-music-studio-bice.vercel.app',
    badge: '/icon-72.png'
  });

  let sent = 0, failed = 0;
  await Promise.all(subscriptions.map(async sub => {
    try {
      await webpush.sendNotification(sub, payload);
      sent++;
    } catch (e) {
      console.error('[Push] Send error:', e.statusCode, sub.endpoint?.slice(-20));
      failed++;
    }
  }));

  return res.status(200).json({ success: true, sent, failed, total: subscriptions.length });
}
