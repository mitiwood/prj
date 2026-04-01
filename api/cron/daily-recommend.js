/**
 * /api/cron/daily-recommend — 일일 음악 추천 푸시 발송
 * 매시간 실행 → 해당 시간대 사용자에게 취향 기반 추천곡 푸시
 */
import webpush from 'web-push';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@ddinggok.com';

async function sb(method, path, body) {
  if (!SB_URL || !SB_KEY) return null;
  const opts = { method, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1${path}`, opts);
  const txt = await r.text();
  if (!r.ok) return null;
  return txt ? JSON.parse(txt) : [];
}

function getKSTHour() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return String(kst.getUTCHours()).padStart(2, '0') + ':00';
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!SB_URL || !SB_KEY) return res.status(200).json({ ok: false, error: 'no DB' });

  const currentHour = getKSTHour();
  console.log('[daily-recommend] currentHour(KST):', currentHour);

  try {
    /* 1. 해당 시간대 + daily_push_on=true 사용자 조회 */
    const users = await sb('GET', `/user_prefs?daily_push_on=eq.true&push_time=eq.${currentHour}&select=*`);
    if (!users || !users.length) {
      return res.status(200).json({ ok: true, sent: 0, hour: currentHour, msg: 'no users for this hour' });
    }

    /* VAPID 설정 */
    let pubKey = VAPID_PUBLIC;
    if (pubKey && Buffer.from(pubKey, 'base64').length === 91) {
      pubKey = Buffer.from(pubKey, 'base64').slice(26).toString('base64url');
    }
    let privKey = VAPID_PRIVATE;
    if (!pubKey || !privKey) {
      return res.status(200).json({ ok: false, error: 'VAPID keys not configured' });
    }
    webpush.setVapidDetails(VAPID_EMAIL, pubKey, privKey);

    let sent = 0, failed = 0;

    for (const user of users) {
      try {
        /* 2. 사용자 취향으로 추천곡 찾기 */
        const genres = user.genres || [];
        const moods = user.moods || [];
        const lastTrackId = user.last_track_id || '';

        let track = null;

        /* 장르 기반 인기곡 검색 */
        for (const genre of genres) {
          const rows = await sb('GET', `/tracks?tags=ilike.*${encodeURIComponent(genre)}*&audio_url=neq.&is_public=eq.true&order=comm_likes.desc,created_at.desc&limit=5&select=id,title,tags,audio_url,image_url,owner_name,comm_likes`);
          if (rows && rows.length) {
            /* 이전에 보낸 곡 제외 */
            track = rows.find(t => t.id !== lastTrackId) || rows[0];
            if (track) break;
          }
        }

        /* 장르로 못 찾으면 전체 인기곡 */
        if (!track) {
          const rows = await sb('GET', `/tracks?audio_url=neq.&is_public=eq.true&order=comm_likes.desc,created_at.desc&limit=5&select=id,title,tags,audio_url,image_url,owner_name,comm_likes`);
          if (rows && rows.length) {
            track = rows.find(t => t.id !== lastTrackId) || rows[0];
          }
        }

        if (!track) continue;

        /* 3. 푸시 구독 조회 */
        const subs = await sb('GET', `/push_subscriptions?user_name=ilike.${encodeURIComponent(user.user_name)}&user_provider=eq.${encodeURIComponent(user.user_provider)}&limit=1`);
        if (!subs || !subs.length || !subs[0].subscription) continue;

        const sub = subs[0].subscription;
        const genreTag = (track.tags || '').split(',')[0].trim();
        const payload = JSON.stringify({
          title: '🎵 오늘의 추천곡',
          body: `"${(track.title || '').slice(0, 30)}" by ${track.owner_name || '아티스트'}${genreTag ? ' #' + genreTag : ''}`,
          icon: track.image_url || '/icon-192.png',
          url: `/?play=${track.id}`,
          badge: '/icon-72.png',
        });

        /* 4. 푸시 발송 */
        await webpush.sendNotification(sub, payload);
        sent++;

        /* 5. 마지막 발송 곡 기록 (중복 방지) */
        await sb('PATCH', `/user_prefs?user_name=ilike.${encodeURIComponent(user.user_name)}&user_provider=eq.${encodeURIComponent(user.user_provider)}`, {
          last_sent_at: new Date().toISOString(),
          last_track_id: track.id,
        });

      } catch (e) {
        failed++;
        console.warn('[daily-recommend] user fail:', user.user_name, e.message);
        /* 410 Gone → 구독 만료, 삭제 */
        if (e.statusCode === 410) {
          await sb('DELETE', `/push_subscriptions?user_name=ilike.${encodeURIComponent(user.user_name)}&user_provider=eq.${encodeURIComponent(user.user_provider)}`);
        }
      }
    }

    return res.status(200).json({ ok: true, hour: currentHour, users: users.length, sent, failed });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
