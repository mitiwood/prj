/**
 * /api/telegram — 텔레그램 봇 알림 API (고도화)
 *
 * POST body actions:
 *   (default)  { text, chatId?, parse_mode?, reply_markup?, silent? }  → 메시지 발송 (인라인 키보드 지원)
 *   edit       { action:'edit', message_id, text, chatId?, parse_mode?, reply_markup? }
 *   delete     { action:'delete', message_id, chatId? }               → 메시지 삭제
 *   photo      { action:'photo', photo, caption?, chatId?, parse_mode?, reply_markup? } → 사진 전송
 *   webhook    { action:'webhook' } — 텔레그램 Webhook 수신 (Update 객체)
 *   set_webhook  { action:'set_webhook', url? }  → Webhook URL 등록
 *
 * GET:
 *   ?action=me       → 봇 정보
 *   ?action=updates  → 최근 메시지
 *   ?action=health   → 헬스체크 (봇 + 사이트 + DB)
 *
 * 환경변수: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ADMIN_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const DEFAULT_CHAT_ID = (process.env.TELEGRAM_CHAT_ID || '').trim();
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SITE_URL = process.env.SITE_URL || 'https://ddinggok.com';

/* ── 유틸 ── */

function logBotMessage(channel, text, messageId) {
  if (!SB_URL || !SB_KEY) return;
  const body = JSON.stringify({ channel, text: (text || '').slice(0, 500), message_id: String(messageId || '') });
  fetch(`${SB_URL}/rest/v1/bot_logs`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body,
  }).catch(() => {});
}

function checkAuth(req) {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  return auth === ADMIN_SECRET;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sbFetch(path) {
  if (!SB_URL || !SB_KEY) throw new Error('Supabase not configured');
  const r = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Accept: 'application/json; charset=utf-8' },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return text ? JSON.parse(text) : null;
}

async function tgApi(method, body = null) {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN not configured');
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  if (!body) {
    const r = await fetch(url);
    const d = await r.json();
    if (!d.ok) throw new Error(d.description || 'Telegram API error');
    return d.result;
  }
  const jsonBytes = Buffer.from(JSON.stringify(body), 'utf-8');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(jsonBytes.length) },
    body: jsonBytes,
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.description || 'Telegram API error');
  return d.result;
}

/* parse_mode 오류 시 plain text 폴백으로 재시도하는 래퍼 */
async function safeSend(method, payload) {
  try {
    return await tgApi(method, payload);
  } catch (e) {
    if (payload.parse_mode && /parse/i.test(e.message)) {
      const { parse_mode, ...rest } = payload;
      return await tgApi(method, rest);
    }
    throw e;
  }
}

/* ── 인라인 키보드 빌더 ── */

function buildKeyboard(buttons) {
  // buttons: [[{text, url}], [{text, callback_data}]] 형태 그대로 전달
  if (!buttons || !Array.isArray(buttons) || buttons.length === 0) return undefined;
  return { inline_keyboard: buttons };
}

function defaultDeployKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🌐 사이트 열기', url: SITE_URL }, { text: '📊 관리자', url: `${SITE_URL}/admin/admin.html` }],
    ],
  };
}

function defaultIssueKeyboard(issueNum) {
  return {
    inline_keyboard: [
      [
        { text: '🔗 이슈 확인', url: `https://github.com/mitiwood/ai-music-studio/issues/${issueNum}` },
        { text: '🌐 사이트', url: SITE_URL },
      ],
    ],
  };
}

/* ── 이벤트 → HTML 포맷 메시지 생성 ── */

function buildEventMessage(event, data, ts) {
  const h = escapeHtml;
  switch (event) {
    case 'music_created':
      return `🎵 <b>새 곡 생성 완료</b>\n\n📝 제목: ${h(data.title || '무제')}\n🎛 모드: ${h(data.mode || 'custom')}\n👤 생성자: ${h(data.user || '익명')}\n⏰ ${h(ts)}`;
    case 'new_user':
      return `👤 <b>새 사용자 로그인</b>\n\n🏷 이름: ${h(data.name || '?')}\n🔗 소셜: ${h(data.provider || '?')}\n⏰ ${h(ts)}`;
    case 'push_sent':
      return `📣 <b>푸시 발송 완료</b>\n\n📝 제목: ${h(data.title || '')}\n✅ 성공: ${h(data.sent || 0)}/${h(data.total || 0)}\n⏰ ${h(ts)}`;
    case 'mv_created':
      return `🎬 <b>뮤직비디오 완성</b>\n\n📝 제목: ${h(data.title || '무제')}\n⏰ ${h(ts)}`;
    case 'comment':
      return `💬 <b>새 댓글</b>\n\n👤 작성자: ${h(data.author || '익명')}\n📝 내용: ${h((data.text || '').slice(0, 100))}\n🎵 곡: ${h(data.track || '')}\n⏰ ${h(ts)}`;
    case 'error':
      return `🚨 <b>시스템 오류</b>\n\n${h(data.message || '알 수 없는 오류')}\n⏰ ${h(ts)}`;
    case 'deploy':
      return `🚀 <b>배포 완료</b>\n\n${h(data.commit || '')}\n👤 ${h(data.author || '')}\n📁 ${h(data.files || '')} (${h(data.count || 0)}개)\n${data.health === '200' ? '✅ 사이트 정상' : `⚠ 응답: ${h(data.health || '?')}`}\n⏰ ${h(ts)}`;
    default:
      return `📌 <b>${h(event)}</b>\n\n${h(JSON.stringify(data).slice(0, 300))}\n⏰ ${h(ts)}`;
  }
}

/* ── Webhook 명령어 처리 ── */

async function handleWebhookCommand(text, chatId) {
  const cmd = (text || '').trim().toLowerCase();

  if (cmd === '/status' || cmd === '/health') {
    let siteStatus = '?';
    try {
      const r = await fetch(SITE_URL, { method: 'HEAD' });
      siteStatus = String(r.status);
    } catch { siteStatus = 'ERR'; }

    let dbStatus = 'N/A';
    if (SB_URL && SB_KEY) {
      try {
        const r = await fetch(`${SB_URL}/rest/v1/`, {
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        });
        dbStatus = r.ok ? 'OK' : String(r.status);
      } catch { dbStatus = 'ERR'; }
    }

    const msg = [
      '📊 <b>시스템 상태</b>',
      '',
      `🌐 사이트: ${siteStatus === '200' ? '✅ 정상' : `⚠ ${escapeHtml(siteStatus)}`}`,
      `🗄 DB: ${dbStatus === 'OK' ? '✅ 정상' : `⚠ ${escapeHtml(dbStatus)}`}`,
      `🤖 봇: ✅ 정상`,
      `⏰ ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
    ].join('\n');

    await tgApi('sendMessage', {
      chat_id: chatId,
      text: msg,
      parse_mode: 'HTML',
      reply_markup: defaultDeployKeyboard(),
    });
    return true;
  }

  if (cmd === '/help') {
    const msg = [
      '🤖 <b>AI Music Studio Bot</b>',
      '',
      '/status — 시스템 상태 확인',
      '/health — 헬스체크 (= /status)',
      '/user &lt;닉네임&gt; — 사용자 조회',
      '/site — 사이트 링크',
      '/ping — 봇 응답 테스트',
      '/help — 명령어 목록',
    ].join('\n');

    await tgApi('sendMessage', {
      chat_id: chatId,
      text: msg,
      parse_mode: 'HTML',
    });
    return true;
  }

  if (cmd === '/site') {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: `🌐 <b>AI Music Studio</b>\n\n${escapeHtml(SITE_URL)}`,
      parse_mode: 'HTML',
      reply_markup: defaultDeployKeyboard(),
    });
    return true;
  }

  if (cmd === '/ping') {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: 'pong!',
    });
    return true;
  }

  /* /user <이름> — 특정 사용자 조회 */
  if (cmd.startsWith('/user ') || cmd === '/user') {
    const query = (text || '').slice(6).trim();
    if (!query) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: '사용법: /user <닉네임>\n예: /user 홍길동',
      });
      return true;
    }

    if (!SB_URL || !SB_KEY) {
      await tgApi('sendMessage', { chat_id: chatId, text: 'DB 미연결 상태입니다.' });
      return true;
    }

    try {
      /* 이름에 포함된 사용자 검색 */
      const users = await sbFetch(`/users?name=ilike.*${encodeURIComponent(query)}*&order=last_login.desc&limit=10`);

      if (!users || users.length === 0) {
        await tgApi('sendMessage', {
          chat_id: chatId,
          text: `"${escapeHtml(query)}" 검색 결과가 없습니다.`,
          parse_mode: 'HTML',
        });
        return true;
      }

      const lines = users.map((u, i) => {
        const lastLogin = u.last_login ? new Date(u.last_login).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-';
        const provider = u.provider || '-';
        const email = u.email || '-';
        const count = u.login_count || 0;
        const plan = u.plan || 'free';
        return [
          `${i + 1}. <b>${escapeHtml(u.name || '?')}</b>`,
          `   소셜: ${escapeHtml(provider)}`,
          `   이메일: ${escapeHtml(email)}`,
          `   플랜: ${escapeHtml(plan)}`,
          `   방문: ${count}회`,
          `   마지막 로그인: ${escapeHtml(lastLogin)}`,
        ].join('\n');
      });

      const msg = `🔍 <b>"${escapeHtml(query)}" 검색 결과</b> (${users.length}명)\n\n${lines.join('\n\n')}`;

      await tgApi('sendMessage', {
        chat_id: chatId,
        text: msg,
        parse_mode: 'HTML',
      });
    } catch (e) {
      await tgApi('sendMessage', { chat_id: chatId, text: '사용자 조회 중 오류: ' + (e.message || '').slice(0, 100) });
    }
    return true;
  }

  return false;
}

/* ── 메인 핸들러 ── */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* ══ GET ══ */
  if (req.method === 'GET') {
    const action = req.query?.action || 'me';

    /* health — 공개 헬스체크 */
    if (action === 'health') {
      let botOk = false;
      try { await tgApi('getMe'); botOk = true; } catch {}
      let siteOk = false;
      try { const r = await fetch(SITE_URL, { method: 'HEAD' }); siteOk = r.status === 200; } catch {}
      let dbOk = false;
      if (SB_URL && SB_KEY) {
        try {
          const r = await fetch(`${SB_URL}/rest/v1/`, {
            headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
          });
          dbOk = r.ok;
        } catch {}
      }
      return res.status(200).json({ ok: botOk && siteOk, bot: botOk, site: siteOk, db: dbOk });
    }

    if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

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

  /* ══ POST ══ */
  if (req.method === 'POST') {
    const body = req.body || {};
    const { text, chatId, parse_mode, event, silent, action: postAction, message_id, reply_markup, photo, caption } = body;

    /* ── 1) Webhook 수신 (텔레그램이 보내는 Update 객체) ── */
    if (postAction === 'webhook') {
      const update = body.update || body;
      const msg = update.message;
      if (msg?.text && msg.chat?.id) {
        const handled = await handleWebhookCommand(msg.text, msg.chat.id);
        if (!handled) {
          // 알 수 없는 명령 → 무시 (200 반환)
        }
      }
      return res.status(200).json({ ok: true });
    }

    /* ── set_webhook: Webhook URL 등록 ── */
    if (postAction === 'set_webhook') {
      if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
      const webhookUrl = body.url || `${SITE_URL}/api/telegram`;
      try {
        await tgApi('setWebhook', {
          url: webhookUrl,
          allowed_updates: ['message'],
          drop_pending_updates: true,
        });
        return res.status(200).json({ ok: true, webhook_url: webhookUrl });
      } catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
      }
    }

    /* ── 2) 메시지 삭제 ── */
    if (postAction === 'delete') {
      if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
      const targetChat = chatId || DEFAULT_CHAT_ID;
      if (!targetChat) return res.status(400).json({ error: 'No chat_id configured' });
      if (!message_id) return res.status(400).json({ error: 'message_id required' });
      try {
        await tgApi('deleteMessage', { chat_id: targetChat, message_id: Number(message_id) });
        return res.status(200).json({ ok: true, deleted: true, message_id: Number(message_id) });
      } catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
      }
    }

    /* ── 3) 사진/이미지 전송 ── */
    if (postAction === 'photo') {
      if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
      const targetChat = chatId || DEFAULT_CHAT_ID;
      if (!targetChat) return res.status(400).json({ error: 'No chat_id configured' });
      if (!photo) return res.status(400).json({ error: 'photo (URL) required' });
      try {
        const payload = {
          chat_id: targetChat,
          photo,
          ...(caption ? { caption } : {}),
          ...(parse_mode && parse_mode !== '' ? { parse_mode } : {}),
          ...(reply_markup ? { reply_markup: typeof reply_markup === 'string' ? JSON.parse(reply_markup) : reply_markup } : {}),
          disable_notification: !!silent,
        };
        const result = await safeSend('sendPhoto', payload);
        logBotMessage('telegram', `[photo] ${caption || photo}`, result.message_id);
        return res.status(200).json({ ok: true, message_id: result.message_id });
      } catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
      }
    }

    /* ── 4) 메시지 수정 (인라인 키보드 지원) ── */
    if (postAction === 'edit') {
      if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
      const targetChat = chatId || DEFAULT_CHAT_ID;
      if (!targetChat) return res.status(400).json({ error: 'No chat_id configured' });
      if (!message_id) return res.status(400).json({ error: 'message_id required' });
      if (!text) return res.status(400).json({ error: 'text required' });
      try {
        const payload = {
          chat_id: targetChat,
          message_id: Number(message_id),
          text,
          ...(parse_mode && parse_mode !== '' ? { parse_mode } : {}),
          ...(reply_markup ? { reply_markup: typeof reply_markup === 'string' ? JSON.parse(reply_markup) : reply_markup } : {}),
        };
        const result = await safeSend('editMessageText', payload);
        return res.status(200).json({ ok: true, message_id: result.message_id, edited: true });
      } catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
      }
    }

    /* ── 5) 일반 메시지 발송 (이벤트 + 인라인 키보드 + HTML) ── */

    // 내부 이벤트 알림 (인증 필요)
    if (event) {
      if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
    }

    const targetChat = chatId || DEFAULT_CHAT_ID;
    if (!targetChat) return res.status(400).json({ error: 'No chat_id configured' });
    if (!text && !event) return res.status(400).json({ error: 'text required' });

    let msg = text || '';
    let effectiveParseMode = parse_mode;
    let keyboard = reply_markup ? (typeof reply_markup === 'string' ? JSON.parse(reply_markup) : reply_markup) : undefined;

    if (event) {
      const data = body.data || {};
      const ts = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      msg = buildEventMessage(event, data, ts);
      effectiveParseMode = 'HTML';

      // 이벤트별 기본 키보드 자동 첨부
      if (!keyboard) {
        if (event === 'deploy') keyboard = defaultDeployKeyboard();
        if (data.issueNum) keyboard = defaultIssueKeyboard(data.issueNum);
      }
    }

    try {
      const payload = {
        chat_id: targetChat,
        text: msg,
        ...(effectiveParseMode && effectiveParseMode !== '' ? { parse_mode: effectiveParseMode } : {}),
        ...(keyboard ? { reply_markup: keyboard } : {}),
        disable_notification: !!silent,
      };
      const result = await safeSend('sendMessage', payload);
      logBotMessage('telegram', msg, result.message_id);
      return res.status(200).json({ ok: true, message_id: result.message_id });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
