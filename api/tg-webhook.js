/**
 * /api/tg-webhook — 텔레그램 Webhook 수신 + 명령 처리
 *
 * 텔레그램 봇에게 메시지를 보내면 이 엔드포인트로 전달되어 명령을 실행합니다.
 *
 * 지원 명령:
 *   /상태, /status        → 서버 상태 리포트
 *   /트랙, /tracks        → 최근 트랙 목록
 *   /유저, /users         → 유저 통계
 *   /공지 <내용>          → 공지사항 등록
 *   /공지삭제             → 공지사항 삭제
 *   /삭제 <트랙ID>        → 트랙 삭제
 *   /공개 <트랙ID>        → 트랙 공개 전환
 *   /비공개 <트랙ID>      → 트랙 비공개 전환
 *   /댓글 [트랙ID]        → 최근 댓글 조회
 *   /댓글삭제 <댓글ID>    → 댓글 삭제
 *   /도움, /help          → 명령어 목록
 *   /배포                 → 최근 배포 상태 확인
 *   /알림 <메시지>        → 전체 푸시 알림 발송
 *
 * Webhook 설정:
 *   GET /api/tg-webhook?action=set    → 웹훅 등록
 *   GET /api/tg-webhook?action=remove → 웹훅 해제
 *   GET /api/tg-webhook?action=info   → 웹훅 상태 확인
 */

const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID    = (process.env.TELEGRAM_CHAT_ID || '').trim();
const SB_URL     = process.env.SUPABASE_URL;
const SB_KEY     = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'kenny2024!';
const GH_TOKEN   = process.env.GITHUB_TOKEN || '';
const GH_REPO    = 'mitiwood/ai-music-studio';
const BASE       = 'https://ai-music-studio-bice.vercel.app';

/* ── 유틸 ── */
async function tgSend(chatId, text, opts = {}) {
  if (!BOT_TOKEN) { console.warn('[TG] no BOT_TOKEN'); return { ok: false, reason: 'no_token' }; }
  const payload = {
    chat_id: chatId,
    text,
    disable_notification: !!opts.silent,
  };
  /* parse_mode: '' 이면 필드 자체를 제외 (Telegram 기본=텍스트) */
  const pm = 'parse_mode' in opts ? opts.parse_mode : 'Markdown';
  if (pm) payload.parse_mode = pm;

  const body = Buffer.from(JSON.stringify(payload), 'utf-8');
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(body.length) },
      body,
    });
    if (!r.ok) {
      const errTxt = await r.text().catch(() => '');
      console.warn(`[TG webhook] send ${r.status}:`, errTxt.slice(0, 200));
      /* Markdown 파싱 실패 시 plain text로 재시도 */
      if (pm && r.status === 400 && errTxt.includes('parse')) {
        const retry = Buffer.from(JSON.stringify({ chat_id: chatId, text }), 'utf-8');
        const r2 = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(retry.length) },
          body: retry,
        });
        return { ok: r2.ok, retried: true, status: r2.status };
      }
      return { ok: false, status: r.status, err: errTxt.slice(0, 100) };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[TG webhook] send err:', e.message);
    return { ok: false, err: e.message };
  }
}

async function tgApi(method, body = null) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  if (!body) {
    const r = await fetch(url);
    return r.json();
  }
  const buf = Buffer.from(JSON.stringify(body), 'utf-8');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(buf.length) },
    body: buf,
  });
  return r.json();
}

async function sb(method, path, body = null) {
  if (!SB_URL || !SB_KEY) throw new Error('Supabase 미설정');
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json; charset=utf-8',
    Accept: 'application/json; charset=utf-8',
    Prefer: method === 'GET' ? 'count=exact' : (method === 'POST' ? 'return=representation' : 'return=minimal'),
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1${path}`, opts);
  const txt = await r.text();
  if (!r.ok) throw new Error(`SB ${r.status}: ${txt.slice(0, 100)}`);
  const count = r.headers.get('content-range')?.match(/\/(\d+)/)?.[1];
  return { data: txt ? JSON.parse(txt) : [], count: count ? parseInt(count) : null };
}

function ts() {
  return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

/* ── 명령 처리 ── */
const COMMANDS = {};

/* /도움 */
COMMANDS['도움'] = COMMANDS['help'] = async (chatId) => {
  const help = `🤖 *Kenny Music Studio 봇 명령어*

📊 *모니터링*
상태 — 서버 상태 리포트
트랙 — 최근 트랙 10곡
유저 — 유저 통계
댓글 — 최근 댓글 10개
배포 — 사이트 접근 확인

📝 *관리*
공지 <내용> — 공지사항 등록
공지삭제 — 공지사항 삭제
삭제 <트랙ID> — 트랙 삭제
공개 <트랙ID> — 트랙 공개
비공개 <트랙ID> — 트랙 비공개
댓글삭제 <댓글ID> — 댓글 삭제

📣 *알림*
알림 <메시지> — 전체 푸시 발송

🛠 *코드 수정*
수정 <지시사항> — AI가 코드 수정 후 PR 생성
PR — 최근 PR 목록 확인
머지 <PR번호> — PR 머지 (배포)

💡 슬래시(/) 없이 바로 입력하세요!
⏰ ${ts()}`;
  return await tgSend(chatId, help);
};

/* /상태 */
COMMANDS['상태'] = COMMANDS['status'] = async (chatId) => {
  let report = `📊 *서버 상태 리포트*\n⏰ ${ts()}\n\n`;
  try {
    const { count: trackCount } = await sb('GET', '/tracks?select=id&limit=0');
    const { count: publicCount } = await sb('GET', '/tracks?is_public=eq.true&select=id&limit=0');
    report += `🎵 전체 트랙: *${trackCount ?? '?'}*곡 (공개: ${publicCount ?? '?'})\n`;

    try {
      const { count: userCount } = await sb('GET', '/users?select=id&limit=0');
      report += `👥 사용자: *${userCount ?? '?'}*명\n`;
    } catch {}

    try {
      const { count: commentCount } = await sb('GET', '/comments?select=id&limit=0');
      report += `💬 댓글: *${commentCount ?? '?'}*개\n`;
    } catch {}

    /* 최근 1시간 활동 */
    const since1h = new Date(Date.now() - 3600000).toISOString();
    try {
      const { data: recent } = await sb('GET', `/tracks?created_at=gte.${since1h}&select=id&limit=100`);
      report += `\n🕐 최근 1시간: 신규 ${recent.length}곡\n`;
    } catch {}

    /* 사이트 접근 */
    try {
      const t0 = Date.now();
      const r = await fetch(BASE, { method: 'HEAD' });
      report += `\n✅ 사이트: ${r.status} (${Date.now() - t0}ms)`;
    } catch (e) {
      report += `\n❌ 사이트: ${e.message}`;
    }

    report += `\n🔗 ${BASE}`;
  } catch (e) {
    report += `❌ 오류: ${e.message}`;
  }
  await tgSend(chatId, report);
};

/* /트랙 */
COMMANDS['트랙'] = COMMANDS['tracks'] = async (chatId, arg) => {
  const limit = parseInt(arg) || 10;
  const { data } = await sb('GET', `/tracks?order=created_at.desc&select=id,title,owner_name,owner_provider,gen_mode,comm_likes,is_public,created_at&limit=${Math.min(limit, 30)}`);
  if (!data.length) return tgSend(chatId, '📭 트랙이 없습니다.');

  let msg = `🎵 *최근 트랙* (${data.length}곡)\n\n`;
  data.forEach((t, i) => {
    const time = new Date(t.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit' });
    const pub = t.is_public !== false ? '🌐' : '🔒';
    const likes = t.comm_likes ? ` ❤️${t.comm_likes}` : '';
    msg += `${i + 1}. ${pub} *${(t.title || '무제').replace(/[*_`]/g, '')}*${likes}\n`;
    msg += `   ${t.owner_name || '익명'} · ${t.gen_mode || '?'} · ${time}\n`;
    msg += `   ID: \`${t.id}\`\n\n`;
  });
  await tgSend(chatId, msg);
};

/* /유저 */
COMMANDS['유저'] = COMMANDS['users'] = async (chatId) => {
  const { data, count } = await sb('GET', '/users?select=id,name,provider,created_at&order=created_at.desc&limit=10');
  let msg = `👥 *유저 현황* (총 ${count ?? data.length}명)\n\n`;
  msg += `*최근 가입*\n`;
  data.forEach((u, i) => {
    const time = new Date(u.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const icon = { google: '🔵', kakao: '💬', naver: '🟢' }[u.provider] || '👤';
    msg += `${i + 1}. ${icon} ${(u.name || '?').replace(/[*_`]/g, '')} (${u.provider || '?'}) ${time}\n`;
  });
  await tgSend(chatId, msg);
};

/* /댓글 [트랙ID] */
COMMANDS['댓글'] = COMMANDS['comments'] = async (chatId, arg) => {
  let path = '/comments?order=created_at.desc&select=id,track_id,author_name,content,created_at&limit=10';
  if (arg) path = `/comments?track_id=eq.${arg}&order=created_at.desc&select=id,track_id,author_name,content,created_at&limit=20`;
  const { data } = await sb('GET', path);
  if (!data.length) return tgSend(chatId, '💬 댓글이 없습니다.');
  let msg = `💬 *최근 댓글* (${data.length}개)\n\n`;
  data.forEach((c, i) => {
    const time = new Date(c.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
    const preview = (c.content || '').slice(0, 50).replace(/[*_`]/g, '') + ((c.content || '').length > 50 ? '...' : '');
    msg += `${i + 1}. *${(c.author_name || '익명').replace(/[*_`]/g, '')}*: ${preview}\n   ${time} · ID: \`${c.id}\`\n\n`;
  });
  await tgSend(chatId, msg);
};

/* /공지 <내용> */
COMMANDS['공지'] = COMMANDS['announce'] = async (chatId, arg) => {
  if (!arg) return tgSend(chatId, '⚠️ 사용법:공지 <내용>');
  try {
    const r = await fetch(`${BASE}/api/announcement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
      body: JSON.stringify({ text: arg, type: 'info' }),
    });
    const d = await r.json();
    if (d.ok || d.success) return tgSend(chatId, `✅ 공지 등록 완료!\n\n📢 ${arg}`);
    return tgSend(chatId, `❌ 공지 등록 실패: ${d.error || JSON.stringify(d).slice(0, 100)}`);
  } catch (e) {
    return tgSend(chatId, `❌ 오류: ${e.message}`);
  }
};

/* /공지삭제 */
COMMANDS['공지삭제'] = async (chatId) => {
  try {
    const r = await fetch(`${BASE}/api/announcement`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ADMIN_SECRET}` },
    });
    const d = await r.json();
    return tgSend(chatId, d.ok || d.success ? '✅ 공지 삭제 완료' : `❌ ${d.error || '실패'}`);
  } catch (e) {
    return tgSend(chatId, `❌ 오류: ${e.message}`);
  }
};

/* /삭제 <트랙ID> */
COMMANDS['삭제'] = COMMANDS['delete'] = async (chatId, arg) => {
  if (!arg) return tgSend(chatId, '⚠️ 사용법:삭제 <트랙ID>');
  try {
    const r = await fetch(`${BASE}/api/tracks?id=${encodeURIComponent(arg)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ADMIN_SECRET}` },
    });
    const d = await r.json();
    return tgSend(chatId, d.success !== false ? `✅ 트랙 삭제 완료: \`${arg}\`` : `❌ ${d.error || '삭제 실패'}`);
  } catch (e) {
    return tgSend(chatId, `❌ 오류: ${e.message}`);
  }
};

/* /공개 <트랙ID> */
COMMANDS['공개'] = async (chatId, arg) => {
  if (!arg) return tgSend(chatId, '⚠️ 사용법:공개 <트랙ID>');
  try {
    await sb('PATCH', `/tracks?id=eq.${arg}`, { is_public: true });
    return tgSend(chatId, `✅ 트랙 공개 전환: \`${arg}\``);
  } catch (e) {
    return tgSend(chatId, `❌ 오류: ${e.message}`);
  }
};

/* /비공개 <트랙ID> */
COMMANDS['비공개'] = async (chatId, arg) => {
  if (!arg) return tgSend(chatId, '⚠️ 사용법:비공개 <트랙ID>');
  try {
    await sb('PATCH', `/tracks?id=eq.${arg}`, { is_public: false });
    return tgSend(chatId, `✅ 트랙 비공개 전환: \`${arg}\``);
  } catch (e) {
    return tgSend(chatId, `❌ 오류: ${e.message}`);
  }
};

/* /댓글삭제 <댓글ID> */
COMMANDS['댓글삭제'] = async (chatId, arg) => {
  if (!arg) return tgSend(chatId, '⚠️ 사용법:댓글삭제 <댓글ID>');
  try {
    await sb('DELETE', `/comments?id=eq.${arg}`, null);
    return tgSend(chatId, `✅ 댓글 삭제 완료: \`${arg}\``);
  } catch (e) {
    return tgSend(chatId, `❌ 오류: ${e.message}`);
  }
};

/* /배포 */
COMMANDS['배포'] = COMMANDS['deploy'] = async (chatId) => {
  try {
    const t0 = Date.now();
    const r = await fetch(BASE);
    const ms = Date.now() - t0;
    const ok = r.status >= 200 && r.status < 400;
    let msg = ok
      ? `✅ *사이트 정상*\nHTTP ${r.status} · ${ms}ms\n🔗 ${BASE}`
      : `⚠️ *사이트 이상*\nHTTP ${r.status} · ${ms}ms\n점검이 필요합니다.`;
    return tgSend(chatId, msg);
  } catch (e) {
    return tgSend(chatId, `❌ 사이트 접근 불가: ${e.message}`);
  }
};

/* /알림 <메시지> */
COMMANDS['알림'] = COMMANDS['push'] = async (chatId, arg) => {
  if (!arg) return tgSend(chatId, '⚠️ 사용법:알림 <메시지>');
  try {
    const r = await fetch(`${BASE}/api/push-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
      body: JSON.stringify({ title: 'Kenny Music Studio', body: arg }),
    });
    const d = await r.json();
    const sent = d.sent ?? d.success ?? 0;
    const total = d.total ?? '?';
    return tgSend(chatId, `📣 *푸시 발송 완료*\n\n메시지: ${arg}\n전송: ${sent}/${total}`);
  } catch (e) {
    return tgSend(chatId, `❌ 오류: ${e.message}`);
  }
};

/* ── GitHub API 헬퍼 ── */
async function ghApi(method, path, body = null) {
  if (!GH_TOKEN) throw new Error('GITHUB_TOKEN 미설정');
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}${path}`, opts);
  const txt = await r.text();
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${txt.slice(0, 150)}`);
  return txt ? JSON.parse(txt) : {};
}

/* 수정 <지시사항> — GitHub Issue 생성 → Claude Code Action 트리거 */
COMMANDS['수정'] = COMMANDS['fix'] = COMMANDS['edit'] = async (chatId, arg) => {
  if (!arg) return tgSend(chatId, '⚠️ 사용법: 수정 <지시사항>\n\n예시:\n수정 로그인 버튼 색상을 파란색으로\n수정 커뮤니티 탭 로딩 속도 개선');
  if (!GH_TOKEN) return tgSend(chatId, '⚠️ GITHUB\\_TOKEN 환경변수가 설정되지 않았어요.\nVercel 환경변수에 추가해주세요.');

  const r1 = await tgSend(chatId, `🔄 수정 요청을 처리 중...\n\n📝 "${arg.replace(/[*_`\[]/g, '')}"`, { parse_mode: '' });

  try {
    /* GitHub API로 Issue 생성 */
    const ghUrl = `https://api.github.com/repos/${GH_REPO}/issues`;
    const ghBody = JSON.stringify({
      title: `[텔레그램] ${arg.slice(0, 60)}`,
      body: `## 수정 요청\n\n${arg}\n\n---\n> 텔레그램 봇에서 요청됨 · ${ts()}`,
      labels: ['claude-fix'],
    });
    const ghReq = await fetch(ghUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'kenny-music-bot',
      },
      body: ghBody,
    });
    const ghTxt = await ghReq.text();

    if (!ghReq.ok) {
      const safeErr = ghTxt.slice(0, 200).replace(/[*_`\[\]]/g, '');
      const r2 = await tgSend(chatId, `❌ Issue 생성 실패\n\nHTTP ${ghReq.status}\n${safeErr}`, { parse_mode: '' });
      return { step: 'gh_fail', r1, r2, ghStatus: ghReq.status };
    }

    const issue = JSON.parse(ghTxt);
    const safeArg = arg.replace(/[*_`\[]/g, '');
    const r2 = await tgSend(chatId, [
      `✅ 수정 요청 등록 완료!`,
      ``,
      `📋 Issue #${issue.number}`,
      `📝 ${safeArg}`,
      ``,
      `🤖 Claude Code가 자동으로 코드를 수정하고 PR을 생성합니다.`,
      `완료되면 알림이 올 거예요.`,
      ``,
      `🔗 ${issue.html_url}`,
    ].join('\n'), { parse_mode: '' });
    return { step: 'ok', r1, r2, issue: issue.number };
  } catch (e) {
    const safeMsg = (e.message || 'unknown').replace(/[*_`\[\]]/g, '');
    const r2 = await tgSend(chatId, `❌ Issue 생성 오류: ${safeMsg}`, { parse_mode: '' });
    return { step: 'error', r1, r2, err: safeMsg };
  }
};

/* PR — 최근 PR 목록 확인 */
COMMANDS['pr'] = COMMANDS['PR'] = async (chatId, arg) => {
  if (!GH_TOKEN) return tgSend(chatId, '⚠️ GITHUB\\_TOKEN 미설정');
  try {
    const prs = await ghApi('GET', '/pulls?state=open&sort=created&direction=desc&per_page=10');
    if (!prs.length) return tgSend(chatId, '📭 열린 PR이 없습니다.');

    let msg = `🔀 *열린 PR* (${prs.length}개)\n\n`;
    prs.forEach((pr, i) => {
      const time = new Date(pr.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      msg += `${i + 1}. *#${pr.number}* ${pr.title.replace(/[*_`]/g, '')}\n`;
      msg += `   ${pr.user?.login || '?'} · ${time}\n`;
      msg += `   머지하려면: \`머지 ${pr.number}\`\n\n`;
    });
    await tgSend(chatId, msg);
  } catch (e) {
    await tgSend(chatId, `❌ PR 조회 실패: ${e.message}`);
  }
};

/* 머지 <PR번호> — PR 머지 (→ 자동 배포) */
COMMANDS['머지'] = COMMANDS['merge'] = async (chatId, arg) => {
  if (!arg) return tgSend(chatId, '⚠️ 사용법: 머지 <PR번호>\n\nPR 목록 확인: PR');
  if (!GH_TOKEN) return tgSend(chatId, '⚠️ GITHUB\\_TOKEN 미설정');
  const prNum = parseInt(arg);
  if (!prNum) return tgSend(chatId, '⚠️ PR 번호를 숫자로 입력해주세요.');

  try {
    /* PR 정보 확인 */
    const pr = await ghApi('GET', `/pulls/${prNum}`);
    if (pr.state !== 'open') return tgSend(chatId, `⚠️ PR #${prNum}은 이미 ${pr.merged ? '머지됨' : '닫힘'} 상태입니다.`);

    await tgSend(chatId, `🔄 PR #${prNum} 머지 중...\n\n*${pr.title.replace(/[*_`]/g, '')}*`);

    /* 머지 실행 */
    const result = await ghApi('PUT', `/pulls/${prNum}/merge`, {
      merge_method: 'squash',
      commit_title: pr.title,
    });

    if (result.merged) {
      await tgSend(chatId, [
        `✅ *PR #${prNum} 머지 완료!*`,
        ``,
        `📝 ${pr.title.replace(/[*_`]/g, '')}`,
        `🚀 Vercel 자동 배포가 시작됩니다.`,
        ``,
        `약 30초 후 사이트에 반영됩니다.`,
        `🔗 ${BASE}`,
      ].join('\n'));
    } else {
      await tgSend(chatId, `⚠️ 머지 실패: ${result.message || '알 수 없는 오류'}`);
    }
  } catch (e) {
    await tgSend(chatId, `❌ 머지 오류: ${e.message}`);
  }
};

/* ── 메인 핸들러 ── */
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  /* GET — webhook 설정/해제/확인 */
  if (req.method === 'GET') {
    const auth = (req.headers.authorization || '').replace('Bearer ', '');
    if (auth !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

    const action = req.query?.action || 'info';
    const webhookUrl = `${BASE}/api/tg-webhook`;

    if (action === 'set') {
      const result = await tgApi('setWebhook', {
        url: webhookUrl,
        allowed_updates: ['message'],
        drop_pending_updates: true,
      });
      return res.status(200).json({ ok: true, action: 'set', url: webhookUrl, result });
    }
    if (action === 'remove') {
      const result = await tgApi('deleteWebhook', { drop_pending_updates: true });
      return res.status(200).json({ ok: true, action: 'remove', result });
    }
    /* info */
    const result = await tgApi('getWebhookInfo');
    return res.status(200).json({ ok: true, webhook: result.result || result });
  }

  /* POST — 텔레그램 webhook 수신 */
  if (req.method === 'POST') {
    const update = req.body;
    if (!update?.message?.text) return res.status(200).json({ ok: true, skip: 'no text' });

    const chatId = update.message.chat.id;
    const text = (update.message.text || '').trim();
    const fromUser = update.message.from?.first_name || update.message.from?.username || '?';

    /* 보안: 허용된 chatId만 명령 실행 */
    if (CHAT_ID && String(chatId) !== String(CHAT_ID)) {
      await tgSend(chatId, '⛔ 권한이 없습니다. 관리자 채팅에서만 명령을 사용할 수 있어요.');
      return res.status(200).json({ ok: true, rejected: true });
    }

    console.log(`[TG CMD] from=${fromUser} chat=${chatId} text=${text}`);

    /* 명령 파싱: /명령 [인자] 또는 일반 텍스트 */
    let cmd = '', arg = '';
    if (text.startsWith('/')) {
      const parts = text.slice(1).split(/\s+/);
      cmd = parts[0].replace(/@\w+$/, '').toLowerCase(); /* /cmd@botname 처리 */
      arg = parts.slice(1).join(' ').trim();
    } else {
      /* / 없는 일반 텍스트도 한글 명령으로 처리 */
      const parts = text.split(/\s+/);
      cmd = parts[0].toLowerCase();
      arg = parts.slice(1).join(' ').trim();
    }

    /* 명령 실행 */
    const handler = COMMANDS[cmd];
    let cmdResult = null;
    if (handler) {
      try {
        cmdResult = await handler(chatId, arg);
      } catch (e) {
        console.error('[TG CMD error]', cmd, e.message);
        await tgSend(chatId, `❌ 명령 실행 오류: ${e.message}`);
        cmdResult = { error: e.message };
      }
    } else {
      const sr = await tgSend(chatId, `❓ 알 수 없는 명령: \`${cmd}\`\n"도움" 을 입력하면 명령어 목록을 볼 수 있어요.`);
      cmdResult = { unknown: cmd, sendResult: sr };
    }

    return res.status(200).json({ ok: true, cmd, debug: cmdResult });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
