/**
 * /api/callback — kie.ai 웹훅 콜백 수신
 *
 * 음악/가사 생성 완료 시 kie.ai가 호출하는 엔드포인트.
 * 봇 생성 요청이 Vercel 타임아웃(60초) 내 완료되지 않은 경우,
 * 이 콜백으로 결과를 받아 Supabase 저장 + 텔레그램 알림 전송.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID   = (process.env.TELEGRAM_CHAT_ID || '').trim();
const SB_URL    = process.env.SUPABASE_URL;
const SB_KEY    = process.env.SUPABASE_SERVICE_KEY;
const BASE      = 'https://ai-music-studio-bice.vercel.app';

async function tgSend(text) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  const payload = { chat_id: CHAT_ID, text };
  const body = Buffer.from(JSON.stringify(payload), 'utf-8');
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(body.length) },
      body,
    });
  } catch(e) { console.warn('[callback tg]', e.message); }
}

async function sbPost(path, data) {
  if (!SB_URL || !SB_KEY) return null;
  const r = await fetch(`${SB_URL}/rest/v1${path}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json; charset=utf-8',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(data),
  });
  return r.ok ? r.json() : null;
}

async function sbDelete(path) {
  if (!SB_URL || !SB_KEY) return;
  await fetch(`${SB_URL}/rest/v1${path}`, {
    method: 'DELETE',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const body = req.body;
    const taskId = body?.taskId || body?.data?.taskId || '';
    const status = body?.status || body?.data?.status || '';
    const tracks = body?.data?.response?.sunoData || body?.data?.sunoData || body?.tracks || [];

    console.log('[callback]', taskId?.slice(0, 12), status, tracks?.length || 0);

    /* 생성 완료된 경우 — 트랙 저장 + 알림 */
    if (taskId && (status === 'SUCCESS' || status === 'FIRST_SUCCESS') && tracks.length > 0) {
      const saved = [];
      for (const t of tracks) {
        const trackData = {
          id: t.id || t.audioId || `cb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          task_id: taskId,
          title: t.title || '봇 생성곡',
          audio_url: t.audioUrl || t.audio_url || t.song_path || '',
          image_url: t.imageUrl || t.image_url || '',
          tags: t.tags || 'bot-generated',
          lyrics: t.lyrics || t.lyric || '',
          gen_mode: 'bot',
          is_public: true,
          owner_name: 'Kenny Bot',
          owner_avatar: '🤖',
          owner_provider: 'bot',
          comm_likes: 0,
          comm_dislikes: 0,
          comm_plays: 0,
        };
        const result = await sbPost('/tracks', trackData);
        if (result) saved.push(trackData);
      }

      /* pending 레코드 삭제 */
      try { await sbDelete(`/tracks?id=eq.pending-${taskId.slice(0, 12)}`); } catch(e) {}

      /* 텔레그램 알림 */
      if (saved.length > 0) {
        const lines = ['✅ 음악 생성 완료! (콜백)', ''];
        saved.forEach((t, i) => {
          lines.push(`🎶 ${i + 1}. ${t.title}`);
          if (t.audio_url) lines.push(`🔗 ${t.audio_url}`);
        });
        lines.push('', '🌐 커뮤니티에 즉시 공개됨', `🔗 ${BASE}`);
        await tgSend(lines.join('\n'));
      }

      /* 카카오 알림 */
      try {
        const msg = `🎵 봇 음악 생성 완료!\n${saved.map(s => s.title).join(', ')}`;
        await fetch(`${BASE}/api/kakao-notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: msg.slice(0, 300) }),
        });
      } catch(e) {}
    }

    return res.status(200).json({ ok: true, received: true, taskId: taskId?.slice(0, 12) });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, endpoint: 'callback' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
