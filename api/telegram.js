/**
 * /api/telegram — 텔레그램 봇 알림 API
 *
 * POST body: { text, chatId?, parse_mode? }  → 메시지 발송
 * GET  ?action=me                            → 봇 정보 확인
 * GET  ?action=updates                       → 최근 메시지 (chatId 확인용)
 *
 * 환경변수: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'kenny2024!';

function checkAuth(req) {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  return auth === ADMIN_SECRET;
}

async function tgApi(method, body = null) {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN not configured');
  let url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  let opts = { method: 'GET' };
  if (body) {
    /* URL query 방식으로 전송 — 한글 인코딩 문제 우회 */
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== null) params.append(k, String(v));
    }
    url += '?' + params.toString();
  }
  const r = await fetch(url, opts);
  const d = await r.json();
  if (!d.ok) throw new Error(d.description || 'Telegram API error');
  return d.result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* GET — 봇 정보 / 업데이트 조회 */
  if (req.method === 'GET') {
    if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
    const action = req.query?.action || 'me';

    if (action === 'me') {
      try {
        const me = await tgApi('getMe');
        return res.status(200).json({ ok: true, bot: me, chatId: DEFAULT_CHAT_ID || null });
      } catch (e) {
        return res.status(200).json({ ok: false, error: e.message, configured: !!BOT_TOKEN });
      }
    }

    if (action === 'updates') {
      try {
        const updates = await tgApi('getUpdates', { limit: 10, offset: -10 });
        const chats = updates.map(u => ({
          chatId: u.message?.chat?.id,
          name: u.message?.chat?.first_name || u.message?.chat?.title || '',
          username: u.message?.chat?.username || '',
          text: u.message?.text || '',
          date: u.message?.date,
        })).filter(c => c.chatId);
        return res.status(200).json({ ok: true, chats });
      } catch (e) {
        return res.status(200).json({ ok: false, error: e.message });
      }
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  /* POST — 메시지 발송 */
  if (req.method === 'POST') {
    const { text, chatId, parse_mode, event, silent } = req.body || {};

    // 내부 이벤트 알림 (인증 필요)
    if (event) {
      if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
    }

    const targetChat = chatId || DEFAULT_CHAT_ID;
    if (!targetChat) return res.status(400).json({ error: 'No chat_id configured' });
    if (!text && !event) return res.status(400).json({ error: 'text required' });

    // 이벤트 기반 자동 메시지 생성
    let msg = text || '';
    if (event) {
      const data = req.body.data || {};
      const ts = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      switch (event) {
        case 'music_created':
          msg = `🎵 *새 곡 생성 완료*\n제목: ${data.title || '무제'}\n모드: ${data.mode || 'custom'}\n생성자: ${data.user || '익명'}\n⏰ ${ts}`;
          break;
        case 'new_user':
          msg = `👤 *새 사용자 로그인*\n이름: ${data.name || '?'}\n소셜: ${data.provider || '?'}\n⏰ ${ts}`;
          break;
        case 'push_sent':
          msg = `📣 *푸시 발송 완료*\n제목: ${data.title || ''}\n성공: ${data.sent || 0}/${data.total || 0}\n⏰ ${ts}`;
          break;
        case 'mv_created':
          msg = `🎬 *뮤직비디오 완성*\n제목: ${data.title || '무제'}\n⏰ ${ts}`;
          break;
        case 'comment':
          msg = `💬 *새 댓글*\n작성자: ${data.author || '익명'}\n내용: ${(data.text || '').slice(0, 100)}\n곡: ${data.track || ''}\n⏰ ${ts}`;
          break;
        case 'error':
          msg = `🚨 *시스템 오류*\n${data.message || '알 수 없는 오류'}\n⏰ ${ts}`;
          break;
        default:
          msg = `📌 *${event}*\n${JSON.stringify(data).slice(0, 300)}\n⏰ ${ts}`;
      }
    }

    try {
      const result = await tgApi('sendMessage', {
        chat_id: targetChat,
        text: msg,
        parse_mode: parse_mode || 'Markdown',
        disable_notification: !!silent,
      });
      return res.status(200).json({ ok: true, message_id: result.message_id });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
