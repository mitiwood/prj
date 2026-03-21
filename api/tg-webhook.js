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
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const KIE_KEY    = process.env.KIE_API_KEY || '';
const TOSS_KEY   = process.env.TOSS_CLIENT_KEY || '';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '';
const VERCEL_PROJECT = process.env.VERCEL_PROJECT || '';

/* ── 유틸 ── */
async function tgSend(chatId, text, opts = {}) {
  if (!BOT_TOKEN) return;
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
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(retry.length) },
          body: retry,
        });
      }
    }
  } catch (e) { console.warn('[TG webhook] send err:', e.message); }
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
  const help = [
    `🤖 Kenny Music Studio 봇`,
    `총 ${Object.keys(COMMANDS).length}개 명령어 · ${ts()}`,
    ``,
    `━━ 📊 모니터링 (5) ━━`,
    `상태 — 서버+DB+사이트 리포트`,
    `트랙 [N] — 최근 트랙 (기본 10곡)`,
    `유저 — 유저 통계+최근 가입자`,
    `댓글 [트랙ID] — 최근 댓글`,
    `배포 — 사이트 헬스체크+응답속도`,
    ``,
    `━━ 📝 콘텐츠 관리 (6) ━━`,
    `공지 <내용> — 인앱 공지 등록`,
    `공지삭제 — 공지 비활성화`,
    `삭제 <트랙ID> — 트랙 삭제`,
    `공개 <트랙ID> — 트랙 공개 전환`,
    `비공개 <트랙ID> — 트랙 비공개`,
    `댓글삭제 <댓글ID> — 댓글 삭제`,
    ``,
    `━━ 📣 알림 (1) ━━`,
    `알림 <메시지> — 전체 웹 푸시 발송`,
    ``,
    `━━ 🛠 개발 (5) ━━`,
    `수정 <지시> — AI가 코드 수정→PR 자동생성`,
    `PR — 열린 PR 목록`,
    `머지 [번호] — PR 머지 (번호 없으면 자동탐색)`,
    `QA — 전체 코드 점검+봇 리포트`,
    `진행상황 — GitHub Action 작업 추적`,
    ``,
    `━━ 📋 기획 (3) ━━`,
    `기획 <기능설명> — Issue 등록`,
    `백로그 — 미완료 Issue 목록`,
    `버그 <설명> — 버그 리포트 등록`,
    ``,
    `━━ 🎨 디자인 (1) ━━`,
    `디자인 <지시> — UI/CSS 수정 요청→PR`,
    ``,
    `━━ 📊 사용량 (3) ━━`,
    `사용량 — 전체 서비스 (DB+API+Vercel+유저별)`,
    `일간 — 오늘 활동 리포트`,
    `주간 — 최근 7일 리포트`,
    ``,
    `━━ 📖 레퍼런스 (2) ━━`,
    `kie [질문] — kie.ai API 문서 조회`,
    `작업 [카테고리] — 구현 현황 (8카테고리 50항목)`,
    ``,
    `💡 슬래시(/) 없이 바로 입력!`,
    `💬 자연어도 OK (예: "뭐 했어", "서버 괜찮아?")`,
  ].join('\n');
  await tgSend(chatId, help, { parse_mode: '' });
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

  await tgSend(chatId, `🔄 수정 요청을 처리 중...\n\n📝 "${arg.replace(/[*_`\[]/g, '')}"`, { parse_mode: '' });

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
      await tgSend(chatId, `❌ Issue 생성 실패\n\nHTTP ${ghReq.status}\n${safeErr}`, { parse_mode: '' });
      return;
    }

    const issue = JSON.parse(ghTxt);
    const safeArg = arg.replace(/[*_`\[]/g, '');
    await tgSend(chatId, [
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
  } catch (e) {
    const safeMsg = (e.message || 'unknown').replace(/[*_`\[\]]/g, '');
    await tgSend(chatId, `❌ Issue 생성 오류: ${safeMsg}`, { parse_mode: '' });
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

/* 머지 — 번호 없으면 자동 탐색, 1개면 바로 머지 */
COMMANDS['머지'] = COMMANDS['merge'] = async (chatId, arg) => {
  if (!GH_TOKEN) return tgSend(chatId, '⚠️ GITHUB\\_TOKEN 미설정');
  let prNum = parseInt(arg);

  /* 번호 없으면 열린 PR 자동 탐색 */
  if (!prNum) {
    try {
      const prs = await ghApi('GET', '/pulls?state=open&sort=created&direction=desc&per_page=10');
      if (!prs.length) return tgSend(chatId, '📭 열린 PR이 없어요.', { parse_mode: '' });
      if (prs.length === 1) {
        prNum = prs[0].number;
        await tgSend(chatId, `🔍 열린 PR 1개 발견 → #${prNum} 자동 머지합니다.`, { parse_mode: '' });
      } else {
        let msg = `🔀 열린 PR ${prs.length}개 — 번호를 지정해주세요\n\n`;
        prs.forEach(pr => { msg += `#${pr.number} ${pr.title}\n`; });
        msg += `\n예: 머지 ${prs[0].number}`;
        return tgSend(chatId, msg, { parse_mode: '' });
      }
    } catch(e) { return tgSend(chatId, `❌ PR 조회 실패: ${e.message}`, { parse_mode: '' }); }
  }

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

/* QA — 전체 QA 점검 → Claude Code Action */
const QA_BODY = `## QA 전체 점검 요청

아래 항목을 코드 레벨에서 점검하고 결과를 리포트해주세요.

### 점검 항목
1. 미니플레이어 재생/일시정지
2. 커뮤니티 리스트 클릭 재생
3. 풀플레이어 확장/축소
4. 다음곡 버튼
5. 심플모드 가사+AI 작사
6. 커스텀모드 생성
7. 플랜카드 UI
8. 오디오 에러 핸들링
9. stopAllAudio
10. 모바일 반응형

### 규칙
- index.html 코드를 읽고 각 항목의 로직/문법/런타임 이슈를 확인
- 버그 발견 시 즉시 수정
- 기존 기능을 절대 제거하지 않기
- 결과를 아래 표 형식으로 작성

### 결과 리포트 (반드시 이 형식으로)
점검 완료 후 아래 Python 코드를 Bash 도구로 실행하여 텔레그램+카카오에 결과를 전송:

\`\`\`
python3 << 'PYEOF'
import urllib.request, json

# 점검 결과 표 작성 (아래는 예시, 실제 결과로 교체)
msg = """QA 전체 점검 결과

┌─────┬────────────────────────────┬─────────┐
│  #  │         점검 항목          │  결과   │
├─────┼────────────────────────────┼─────────┤
│ 1   │ 미니플레이어 재생/일시정지 │ ✅ 정상 │
├─────┼────────────────────────────┼─────────┤
│ 2   │ 커뮤니티 리스트 클릭 재생  │ ✅ 정상 │
├─────┼────────────────────────────┼─────────┤
│ 3   │ 풀플레이어 확장/축소       │ ✅ 정상 │
├─────┼────────────────────────────┼─────────┤
│ 4   │ 다음곡 버튼               │ ✅ 정상 │
├─────┼────────────────────────────┼─────────┤
│ 5   │ 심플모드 가사+AI 작사     │ ✅ 정상 │
├─────┼────────────────────────────┼─────────┤
│ 6   │ 커스텀모드 생성           │ ✅ 정상 │
├─────┼────────────────────────────┼─────────┤
│ 7   │ 플랜카드 UI              │ ✅ 정상 │
├─────┼────────────────────────────┼─────────┤
│ 8   │ 오디오 에러 핸들링        │ ✅ 정상 │
├─────┼────────────────────────────┼─────────┤
│ 9   │ stopAllAudio             │ ✅ 정상 │
├─────┼────────────────────────────┼─────────┤
│ 10  │ 모바일 반응형            │ ✅ 정상 │
└─────┴────────────────────────────┴─────────┘
"""
# 실제 점검 결과에 맞게 위 표의 결과 컬럼을 수정하세요
# ✅ 정상 / 🔧 수정 / ❌ 실패

# Telegram
tg = json.dumps({'text': msg, 'parse_mode': ''}, ensure_ascii=False).encode('utf-8')
urllib.request.urlopen(urllib.request.Request('https://ai-music-studio-bice.vercel.app/api/telegram', data=tg, headers={'Content-Type':'application/json; charset=utf-8','Authorization':'Bearer kenny2024!'}))

# Kakao
kk = json.dumps({'text': msg}, ensure_ascii=False).encode('utf-8')
urllib.request.urlopen(urllib.request.Request('https://ai-music-studio-bice.vercel.app/api/kakao-notify', data=kk, headers={'Content-Type':'application/json; charset=utf-8'}))
print('QA report sent')
PYEOF
\`\`\`
`;

/* 진행상황 — GitHub Actions 실행 중인 워크플로우 조회 */
COMMANDS['진행상황'] = COMMANDS['진행'] = COMMANDS['progress'] = async (chatId) => {
  if (!GH_TOKEN) return tgSend(chatId, '⚠️ GITHUB_TOKEN 미설정', { parse_mode: '' });
  try {
    const runs = await ghApi('GET', '/actions/runs?status=in_progress&per_page=5');
    const items = runs.workflow_runs || [];
    if (!items.length) {
      return tgSend(chatId, '✅ 현재 진행 중인 작업이 없어요.\n\n모든 워크플로우가 완료된 상태입니다.', { parse_mode: '' });
    }
    let msg = `🔄 현재 진행 중인 작업 ${items.length}개\n\n`;
    for (const run of items) {
      const name = run.name || '?';
      const started = new Date(run.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
      const elapsed = Math.round((Date.now() - new Date(run.created_at).getTime()) / 60000);
      const issueMatch = (run.head_commit?.message || '').match(/#(\d+)/);
      const issueNum = issueMatch ? issueMatch[1] : '';
      /* 스텝 상세 조회 */
      let stepInfo = '';
      try {
        const jobs = await ghApi('GET', `/actions/runs/${run.id}/jobs`);
        const job = jobs.jobs?.[0];
        if (job?.steps) {
          const running = job.steps.find(s => s.status === 'in_progress');
          const done = job.steps.filter(s => s.conclusion === 'success').length;
          const total = job.steps.length;
          if (running) stepInfo = `\n   ▶ ${running.name}`;
          stepInfo += `\n   진행률: ${done}/${total} 스텝 완료`;
        }
      } catch(e) {}
      msg += `📋 ${name}${issueNum ? ' (Issue #' + issueNum + ')' : ''}\n`;
      msg += `   시작: ${started} (${elapsed}분 경과)${stepInfo}\n\n`;
    }
    /* 최근 완료 1개도 보여주기 */
    try {
      const recent = await ghApi('GET', '/actions/runs?status=completed&per_page=1');
      const last = recent.workflow_runs?.[0];
      if (last) {
        const icon = last.conclusion === 'success' ? '✅' : '❌';
        const ago = Math.round((Date.now() - new Date(last.updated_at).getTime()) / 60000);
        msg += `━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `최근 완료: ${icon} ${last.name} (${ago}분 전)`;
      }
    } catch(e) {}
    await tgSend(chatId, msg, { parse_mode: '' });
  } catch (e) {
    await tgSend(chatId, `❌ 진행상황 조회 실패: ${e.message}`, { parse_mode: '' });
  }
};

COMMANDS['qa'] = COMMANDS['QA'] = async (chatId, arg) => {
  if (!GH_TOKEN) return tgSend(chatId, '⚠️ GITHUB\\_TOKEN 미설정');

  await tgSend(chatId, '🔍 QA 전체 점검을 시작합니다...\n\nClaude Code가 코드를 분석하고 결과를 리포트합니다.', { parse_mode: '' });

  try {
    const issue = await ghApi('POST', '/issues', {
      title: `[QA] 전체 점검 · ${ts()}`,
      body: QA_BODY + `\n---\n> ${arg ? arg + ' · ' : ''}${chatId === CHAT_ID ? '텔레그램' : '카카오'} 봇에서 요청됨 · ${ts()}`,
      labels: ['claude-fix'],
    });

    await tgSend(chatId, [
      '✅ QA 점검 요청 등록!',
      '',
      `📋 Issue #${issue.number}`,
      '',
      '🤖 Claude Code가 10개 항목을 점검합니다.',
      '완료되면 텔레그램+카카오로 결과표가 옵니다.',
      '',
      `🔗 ${issue.html_url}`,
    ].join('\n'), { parse_mode: '' });
  } catch (e) {
    await tgSend(chatId, `❌ QA 요청 실패: ${e.message}`, { parse_mode: '' });
  }
};

/* ── 📋 기획 명령어 ── */

/* 기획 <기능설명> — 기능 요구사항 Issue 등록 */
COMMANDS['기획'] = COMMANDS['plan'] = async (chatId, arg) => {
  if (!arg) return tgSend(chatId, '⚠️ 사용법: 기획 <기능 설명>\n\n예시:\n기획 다크모드 지원\n기획 플레이리스트 공유 기능', { parse_mode: '' });
  if (!GH_TOKEN) return tgSend(chatId, '⚠️ GITHUB_TOKEN 미설정', { parse_mode: '' });
  try {
    const issue = await ghApi('POST', '/issues', {
      title: `[기획] ${arg.slice(0, 60)}`,
      body: `## 기능 요구사항\n\n${arg}\n\n### 체크리스트\n- [ ] 요구사항 정의\n- [ ] 디자인 검토\n- [ ] 개발\n- [ ] QA\n- [ ] 배포\n\n---\n> 텔레그램 봇 · ${ts()}`,
      labels: ['enhancement'],
    });
    await tgSend(chatId, `✅ 기획 등록 완료!\n\n📋 Issue #${issue.number}\n📝 ${arg}\n\n🔗 ${issue.html_url}`, { parse_mode: '' });
  } catch (e) {
    await tgSend(chatId, `❌ 기획 등록 실패: ${e.message}`, { parse_mode: '' });
  }
};

/* 백로그 — 미완료 Issue 목록 */
COMMANDS['백로그'] = COMMANDS['backlog'] = async (chatId) => {
  if (!GH_TOKEN) return tgSend(chatId, '⚠️ GITHUB_TOKEN 미설정', { parse_mode: '' });
  try {
    const issues = await ghApi('GET', '/issues?state=open&sort=created&direction=desc&per_page=15');
    const filtered = issues.filter(i => !i.pull_request);
    if (!filtered.length) return tgSend(chatId, '📭 열린 Issue가 없습니다.', { parse_mode: '' });

    let msg = `📋 백로그 (${filtered.length}개)\n\n`;
    filtered.forEach((issue, i) => {
      const labels = issue.labels?.map(l => l.name).join(', ') || '';
      const time = new Date(issue.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' });
      msg += `${i + 1}. #${issue.number} ${issue.title}\n`;
      if (labels) msg += `   🏷 ${labels}\n`;
      msg += `   ${time}\n\n`;
    });
    await tgSend(chatId, msg, { parse_mode: '' });
  } catch (e) {
    await tgSend(chatId, `❌ 백로그 조회 실패: ${e.message}`, { parse_mode: '' });
  }
};

/* 버그 <설명> — 버그 리포트 */
COMMANDS['버그'] = COMMANDS['bug'] = async (chatId, arg) => {
  if (!arg) return tgSend(chatId, '⚠️ 사용법: 버그 <설명>\n\n예시:\n버그 모바일에서 재생 버튼 안 눌림\n버그 로그인 후 화면 깜빡임', { parse_mode: '' });
  if (!GH_TOKEN) return tgSend(chatId, '⚠️ GITHUB_TOKEN 미설정', { parse_mode: '' });
  try {
    const issue = await ghApi('POST', '/issues', {
      title: `[버그] ${arg.slice(0, 60)}`,
      body: `## 버그 리포트\n\n**현상:** ${arg}\n\n**재현 환경:**\n- [ ] PC\n- [ ] 모바일\n\n**심각도:** 🔴 높음 / 🟡 중간 / 🟢 낮음\n\n---\n> 텔레그램 봇 · ${ts()}`,
      labels: ['bug'],
    });
    await tgSend(chatId, `🐛 버그 리포트 등록!\n\n📋 Issue #${issue.number}\n📝 ${arg}\n\nAI 자동 수정: "수정 ${arg}"\n\n🔗 ${issue.html_url}`, { parse_mode: '' });
  } catch (e) {
    await tgSend(chatId, `❌ 버그 등록 실패: ${e.message}`, { parse_mode: '' });
  }
};

/* ── 🎨 디자인 명령어 ── */

COMMANDS['디자인'] = COMMANDS['design'] = async (chatId, arg) => {
  if (!arg) return tgSend(chatId, '⚠️ 사용법: 디자인 <지시사항>\n\n예시:\n디자인 버튼 둥글게 + 그림자 추가\n디자인 다크모드 색상 변경', { parse_mode: '' });
  if (!GH_TOKEN) return tgSend(chatId, '⚠️ GITHUB_TOKEN 미설정', { parse_mode: '' });
  try {
    const issue = await ghApi('POST', '/issues', {
      title: `[디자인] ${arg.slice(0, 60)}`,
      body: `## 디자인 수정 요청\n\n${arg}\n\n### 규칙\n- CSS/UI만 수정할 것\n- 기능 로직 변경 금지\n- 모바일 반응형 유지\n\n---\n> 텔레그램 봇 · ${ts()}`,
      labels: ['claude-fix', 'design'],
    });
    await tgSend(chatId, `🎨 디자인 요청 등록!\n\n📋 Issue #${issue.number}\n📝 ${arg}\n\n🤖 Claude가 CSS/UI를 수정합니다.\n\n🔗 ${issue.html_url}`, { parse_mode: '' });
  } catch (e) {
    await tgSend(chatId, `❌ 디자인 요청 실패: ${e.message}`, { parse_mode: '' });
  }
};

/* ── 📊 사용량 명령어 ── */

COMMANDS['사용량'] = COMMANDS['usage'] = COMMANDS['stats'] = async (chatId) => {
  try {
    /* ── 1. Supabase DB 통계 ── */
    const { count: trackCount } = await sb('GET', '/tracks?select=id&limit=0');
    const { count: publicCount } = await sb('GET', '/tracks?is_public=eq.true&select=id&limit=0');
    let userCount = '?', commentCount = '?', payCount = '?';
    try { userCount = (await sb('GET', '/users?select=id&limit=0')).count ?? '?'; } catch {}
    try { commentCount = (await sb('GET', '/comments?select=id&limit=0')).count ?? '?'; } catch {}
    try { payCount = (await sb('GET', '/payments?select=id&limit=0')).count ?? '?'; } catch {}

    const today = new Date().toISOString().split('T')[0];
    const yesterdayDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    let todayTracks = 0, todayUsers = 0, todayComments = 0;
    let yesterdayTracks = 0, yesterdayUsers = 0, yesterdayComments = 0;
    try { todayTracks = (await sb('GET', `/tracks?created_at=gte.${today}&select=id&limit=100`)).data.length; } catch {}
    try { todayUsers = (await sb('GET', `/users?created_at=gte.${today}&select=id&limit=100`)).data.length; } catch {}
    try { todayComments = (await sb('GET', `/comments?created_at=gte.${today}&select=id&limit=100`)).data.length; } catch {}
    try { yesterdayTracks = (await sb('GET', `/tracks?created_at=gte.${yesterdayDate}&created_at=lt.${today}&select=id&limit=100`)).data.length; } catch {}
    try { yesterdayUsers = (await sb('GET', `/users?created_at=gte.${yesterdayDate}&created_at=lt.${today}&select=id&limit=100`)).data.length; } catch {}
    try { yesterdayComments = (await sb('GET', `/comments?created_at=gte.${yesterdayDate}&created_at=lt.${today}&select=id&limit=100`)).data.length; } catch {}
    const _delta = (today, yesterday) => { const d = today - yesterday; return d > 0 ? ` ▲ +${d}` : d < 0 ? ` ▼ ${d}` : ' ─ 0'; };
    const costEstimate = (todayTracks * 0.05).toFixed(2);

    /* ── 2. Claude API 상태 ── */
    let claudeStatus = 'KEY 미설정';
    if (ANTHROPIC_KEY) {
      try {
        const cr = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
        });
        if (cr.ok) claudeStatus = '정상 (Haiku)';
        else if (cr.status === 429) claudeStatus = '한도 초과 (429)';
        else if (cr.status === 401) claudeStatus = '키 무효 (401)';
        else claudeStatus = `오류 (${cr.status})`;
      } catch (e) { claudeStatus = `접속불가`; }
    }

    /* ── 3. kie.ai 상태 ── */
    let kieStatus = 'KEY 미설정';
    if (KIE_KEY) {
      try {
        const kr = await fetch('https://api.kie.ai/api/suno/v1/music', {
          method: 'POST',
          headers: { Authorization: `Bearer ${KIE_KEY.trim()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'test', mv: false }),
        });
        if (kr.ok || kr.status === 200) kieStatus = '정상';
        else if (kr.status === 402 || kr.status === 403) kieStatus = '크레딧 부족/권한';
        else kieStatus = `응답 ${kr.status}`;
      } catch (e) { kieStatus = '접속불가'; }
    }

    /* ── 4. Toss 상태 ── */
    const tossMode = TOSS_KEY ? (TOSS_KEY.startsWith('test_') ? 'TEST' : 'LIVE') : '미설정';

    /* ── 5. Vercel 배포 ── */
    let deployInfo = '조회불가';
    if (VERCEL_TOKEN) {
      try {
        const vr = await fetch(`https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT}&limit=1&state=READY`, {
          headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
        });
        const vd = await vr.json();
        if (vd.deployments?.length) {
          const d = vd.deployments[0];
          const dt = new Date(d.created).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
          deployInfo = `${dt} (${d.readyState})`;
        }
      } catch {}
    }

    /* ── 6. 사이트 응답 ── */
    let siteMs = '?';
    try {
      const t0 = Date.now();
      const sr = await fetch(BASE, { method: 'HEAD' });
      siteMs = `${Date.now() - t0}ms (${sr.status})`;
    } catch (e) { siteMs = '접속불가'; }

    /* ── 7. 유저별 사용량 (상위 5명) ── */
    let userStats = [];
    try {
      const { data: allUsers } = await sb('GET', '/users?select=name,provider,plan,credits,login_count,last_login&order=last_login.desc&limit=20');
      if (allUsers?.length) {
        /* 각 유저의 이번 달 트랙 수 조회 */
        const monthStart = new Date();
        monthStart.setDate(1); monthStart.setHours(0,0,0,0);
        for (const u of allUsers.slice(0, 5)) {
          let songCount = 0;
          try {
            const { data: ut } = await sb('GET', `/tracks?owner_name=ilike.${encodeURIComponent(u.name)}&owner_provider=eq.${encodeURIComponent(u.provider)}&created_at=gte.${monthStart.toISOString()}&select=id&limit=500`);
            songCount = ut?.length || 0;
          } catch {}
          const provIcon = { google: '🔵', kakao: '💬', naver: '🟢' }[u.provider] || '👤';
          userStats.push(`${provIcon} ${u.name} (${u.plan||'free'}) — ${songCount}곡/월, 로그인 ${u.login_count||1}회`);
        }
      }
    } catch {}

    const msg = [
      `📊 전체 사용량 대시보드`,
      `⏰ ${ts()}`,
      ``,
      `━━ Supabase DB ━━`,
      `🎵 트랙: ${trackCount ?? '?'} (공개 ${publicCount ?? '?'}) / 오늘 +${todayTracks}${_delta(todayTracks, yesterdayTracks)}`,
      `👥 유저: ${userCount} / 오늘 +${todayUsers}${_delta(todayUsers, yesterdayUsers)}`,
      `💬 댓글: ${commentCount} / 오늘 +${todayComments}${_delta(todayComments, yesterdayComments)}`,
      `💰 결제: ${payCount}건`,
      `💵 오늘 비용 추정: $${costEstimate} (${todayTracks}트랙 × $0.05)`,
      ``,
      `━━ 유저별 사용량 (이번 달) ━━`,
      ...(userStats.length ? userStats : ['데이터 없음']),
      ``,
      `━━ 외부 서비스 ━━`,
      `🤖 Claude API: ${claudeStatus}`,
      `🎤 kie.ai: ${kieStatus}`,
      `💳 Toss: ${tossMode}`,
      `🚀 최신 배포: ${deployInfo}`,
      `🌐 사이트: ${siteMs}`,
    ].join('\n');
    await tgSend(chatId, msg, { parse_mode: '' });

    /* 카카오톡에도 동일 내용 전송 (300자 제한 → 2파트) */
    try {
      const kakao1 = [
        `📊 전체 사용량 대시보드`,
        `⏰ ${ts()}`,
        ``,
        `━━ Supabase DB ━━`,
        `🎵 트랙: ${trackCount ?? '?'} (공개 ${publicCount ?? '?'}) / 오늘 +${todayTracks}${_delta(todayTracks, yesterdayTracks)}`,
        `👥 유저: ${userCount} / 오늘 +${todayUsers}${_delta(todayUsers, yesterdayUsers)}`,
        `💬 댓글: ${commentCount} / 오늘 +${todayComments}${_delta(todayComments, yesterdayComments)}`,
        `💰 결제: ${payCount}건`,
        `💵 비용 추정: $${costEstimate}`,
        ``,
        `━━ 유저별 (이번 달) ━━`,
        ...(userStats.length ? userStats.slice(0,3) : ['없음']),
      ].join('\n');
      const kakao2 = [
        `━━ 외부 서비스 ━━`,
        `🤖 Claude: ${claudeStatus}`,
        `🎤 kie.ai: ${kieStatus}`,
        `💳 Toss: ${tossMode}`,
        `🚀 배포: ${deployInfo}`,
        `🌐 사이트: ${siteMs}`,
      ].join('\n');
      const _kSend = (t) => fetch(`${BASE}/api/kakao-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
        body: JSON.stringify({ text: t }),
      });
      await _kSend(kakao1);
      await _kSend(kakao2);
    } catch {}
  } catch (e) {
    await tgSend(chatId, `❌ 사용량 조회 실패: ${e.message}`, { parse_mode: '' });
  }
};

/* 일간 — 오늘 활동 리포트 */
COMMANDS['일간'] = COMMANDS['daily'] = async (chatId) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: tracks } = await sb('GET', `/tracks?created_at=gte.${today}&select=id,title,owner_name,gen_mode,created_at&order=created_at.desc&limit=50`);
    const { data: users } = await sb('GET', `/users?created_at=gte.${today}&select=id,name,provider&order=created_at.desc&limit=50`);
    const { data: comments } = await sb('GET', `/comments?created_at=gte.${today}&select=id,author_name,content&order=created_at.desc&limit=50`);

    let msg = `📅 일간 리포트 (${today})\n⏰ ${ts()}\n\n`;
    msg += `🎵 신규 트랙: ${tracks.length}곡\n`;
    tracks.slice(0, 5).forEach(t => {
      msg += `  · ${t.title || '무제'} (${t.owner_name || '익명'}, ${t.gen_mode || '?'})\n`;
    });
    if (tracks.length > 5) msg += `  ... 외 ${tracks.length - 5}곡\n`;

    msg += `\n👥 신규/재방문: ${users.length}명\n`;
    users.slice(0, 5).forEach(u => {
      msg += `  · ${u.name || '?'} (${u.provider || '?'})\n`;
    });

    msg += `\n💬 댓글: ${comments.length}개\n`;
    comments.slice(0, 3).forEach(c => {
      msg += `  · ${c.author_name || '익명'}: ${(c.content || '').slice(0, 40)}\n`;
    });

    if (!tracks.length && !users.length && !comments.length) msg += '\n💤 오늘은 활동이 없습니다.';

    await tgSend(chatId, msg, { parse_mode: '' });
  } catch (e) {
    await tgSend(chatId, `❌ 일간 리포트 실패: ${e.message}`, { parse_mode: '' });
  }
};

/* 주간 — 최근 7일 리포트 */
COMMANDS['주간'] = COMMANDS['weekly'] = async (chatId) => {
  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: tracks } = await sb('GET', `/tracks?created_at=gte.${since}&select=id,gen_mode,created_at&limit=500`);
    const { data: users } = await sb('GET', `/users?created_at=gte.${since}&select=id,provider&limit=500`);
    const { data: comments } = await sb('GET', `/comments?created_at=gte.${since}&select=id&limit=500`);

    /* 일별 트랙 수 집계 */
    const dailyMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      dailyMap[d.toISOString().split('T')[0]] = 0;
    }
    tracks.forEach(t => {
      const d = t.created_at?.split('T')[0];
      if (d && d in dailyMap) dailyMap[d]++;
    });

    /* 모드별 집계 */
    const modes = {};
    tracks.forEach(t => { modes[t.gen_mode || '?'] = (modes[t.gen_mode || '?'] || 0) + 1; });

    /* 프로바이더별 유저 */
    const providers = {};
    users.forEach(u => { providers[u.provider || '?'] = (providers[u.provider || '?'] || 0) + 1; });

    let msg = `📊 주간 리포트 (최근 7일)\n⏰ ${ts()}\n\n`;
    msg += `🎵 트랙: ${tracks.length}곡 / 👥 사용자: ${users.length}명 / 💬 댓글: ${comments.length}개\n\n`;

    msg += `일별 트랙 생성:\n`;
    Object.entries(dailyMap).forEach(([d, c]) => {
      const bar = '█'.repeat(Math.min(c, 20)) || '·';
      msg += `  ${d.slice(5)} ${bar} ${c}\n`;
    });

    msg += `\n모드별:\n`;
    Object.entries(modes).sort((a, b) => b[1] - a[1]).forEach(([m, c]) => {
      msg += `  ${m}: ${c}곡\n`;
    });

    msg += `\n소셜별 사용자:\n`;
    Object.entries(providers).sort((a, b) => b[1] - a[1]).forEach(([p, c]) => {
      msg += `  ${p}: ${c}명\n`;
    });

    await tgSend(chatId, msg, { parse_mode: '' });
  } catch (e) {
    await tgSend(chatId, `❌ 주간 리포트 실패: ${e.message}`, { parse_mode: '' });
  }
};

/* ── 📋 작업이력 / 구현현황 조회 ── */
const WORK_CATEGORIES = {
  '음악': { icon: '🎵', title: '음악 만들기 고도화', items: [
    'buildOptimalPrompt() 구조화 프롬프트',
    '프리셋 10개 원클릭 캐러셀',
    'duration 자동+extend 연결',
    'A/B 비교 UI (2곡 라벨+안내)',
    '가사 에디터 (섹션태그/글자수/언어감지)',
    '심플→커스텀 전환 버튼',
    '생성 실패 자동 재시도 (1회)',
    '연장 체인 (히스토리+체인관계)',
    '리믹스 모드 (장르변경 6프리셋)',
    '보컬 라이브러리 프리셋 6종',
    '아티스트 자동완성 30명',
    'AI 작곡 어시스턴트 (gemini 대화형)',
  ]},
  'UI': { icon: '🎨', title: 'Suno 스타일 UI/UX', items: [
    'SVG 아이콘 Lucide/Phosphor 업그레이드',
    '라이브러리 Suno 스타일 전면 개편',
    '커뮤니티 3열 구조 (제목+시간/사용자/스타일)',
    '커뮤니티 재생↔미니플레이어 동기화',
    '미니플레이어 프로그레스바 하단',
    '풀플레이어 데이모드 라이트',
    '탭전환시 바텀시트/팝업 닫기',
    '로딩 안내 MZ톤',
    '바텀시트 미니플레이어 대응',
  ]},
  '리믹스': { icon: '🎤', title: '리믹스 & 커버', items: [
    '리믹스 4종 (연장/커버/스타일재사용/리마스터)',
    '커버 바텀시트 + 스타일 추천칩',
    'add-vocals 파라미터 수정',
    'negativeTags null 에러 수정',
    '커버생성시 탭이동+로딩 포커스',
  ]},
  'AI': { icon: '🤖', title: 'AI 추천 시스템', items: [
    '시간/공간+감정/상태+질감/색채 컨셉',
    '로컬 랜덤 컨셉풀 (API무의존)',
    '곡 제목 자동 생성',
    '곡 설명 한글 번역 적용',
  ]},
  '문서': { icon: '📖', title: '문서 & 스킬', items: [
    'SPEC.md 기능명세서 (566줄)',
    'KIE_API_REFERENCE.md 공식문서 기반',
    '/kie 스킬 (CLI+텔레봇+카카오봇)',
    'CHANGELOG 작업이력',
  ]},
  '공유': { icon: '🔗', title: '카카오 공유', items: [
    'Kakao JS SDK 로드+초기화',
    '카카오스토리 API 종료 대응',
    'SDK→링크복사 폴백 체인',
    '풀플레이어 공유 동일 패턴',
  ]},
  '버그': { icon: '🚨', title: '치명적 버그 수정', items: [
    'switchView 미정의→switchTab 교체',
    '전체 API parse_mode Markdown 제거 (9파일)',
    '텔레그램 알림 누락 근본 해결',
    '에러 모니터링 TG+카카오 동시알림+쿨다운',
    '플랜 3단계 통합 (Single Source of Truth)',
    'checkPlanLimit→generate 연결',
    '서버 크레딧 검증 API',
  ]},
  '봇': { icon: '🤖', title: '봇 시스템', items: [
    '사용량 명령 전체서비스 통합',
    'kie 명령 API레퍼런스 조회',
    '작업 명령 구현현황 조회',
    '실시간 알림 시스템',
    'GitHub private 레포 인증',
  ]},
};

COMMANDS['작업'] = COMMANDS['구현'] = COMMANDS['현황'] = COMMANDS['work'] = async (chatId, arg) => {
  const argLower = (arg||'').toLowerCase();

  /* 카테고리 매칭 */
  const matchKey = arg ? Object.keys(WORK_CATEGORIES).find(k =>
    argLower.includes(k) || argLower.includes(WORK_CATEGORIES[k].title.slice(0,4))
  ) : null;

  if (matchKey) {
    /* 세부 내역 */
    const cat = WORK_CATEGORIES[matchKey];
    let msg = `${cat.icon} ${cat.title} (${cat.items.length}개)\n\n`;
    cat.items.forEach((item, i) => { msg += `${i+1}. ${item}\n`; });
    await tgSend(chatId, msg, { parse_mode: '' });

    /* 카카오에도 전송 */
    try {
      await fetch(`${BASE}/api/kakao-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
        body: JSON.stringify({ text: msg.slice(0, 300) }),
      });
    } catch {}
    return;
  }

  /* 전체 요약 */
  const total = Object.values(WORK_CATEGORIES).reduce((s, c) => s + c.items.length, 0);
  let msg = `📋 구현 현황 (총 ${total}개 항목)\n⏰ ${ts()}\n\n`;
  Object.entries(WORK_CATEGORIES).forEach(([key, cat]) => {
    msg += `${cat.icon} ${cat.title}: ${cat.items.length}개\n`;
  });
  msg += `\n세부 보기: 작업 <카테고리>\n예: 작업 음악, 작업 버그, 작업 UI`;
  await tgSend(chatId, msg, { parse_mode: '' });

  /* 카카오에도 전송 */
  try {
    await fetch(`${BASE}/api/kakao-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
      body: JSON.stringify({ text: msg.slice(0, 300) }),
    });
  } catch {}
};

/* ── 📖 kie.ai API 레퍼런스 조회 ── */
const KIE_SECTIONS = {
  '1': { title: '기본 정보', keywords: ['기본','인증','크레딧','가격','pricing','rate','limit'] },
  '2.1': { title: '음악 생성', keywords: ['음악','생성','generate','만들기','작곡'] },
  '2.2': { title: '곡 연장', keywords: ['연장','extend','이어'] },
  '2.3': { title: '보컬 변환', keywords: ['보컬','vocal','변환','add-vocals'] },
  '2.4': { title: '타임스탬프 가사', keywords: ['카라오케','타임스탬프','timestamp','싱크'] },
  '3': { title: '가사 생성', keywords: ['가사','lyrics','작사'] },
  '4': { title: '비디오 생성', keywords: ['비디오','video','mv','뮤직비디오','kling'] },
  '5': { title: 'Chat Completion', keywords: ['llm','채팅','chat','gemini','gpt'] },
  '6': { title: '모델 목록', keywords: ['모델','model','목록','리스트'] },
  '7': { title: '에러 코드', keywords: ['에러','오류','error','코드'] },
  '8': { title: '폴링 전략', keywords: ['폴링','polling','대기'] },
  '9': { title: '콜백', keywords: ['콜백','callback','webhook'] },
  '10': { title: '사용 중 엔드포인트', keywords: ['전체','사용','endpoint','api'] },
};

COMMANDS['kie'] = COMMANDS['api'] = async (chatId, arg) => {
  if (!arg) {
    const list = Object.entries(KIE_SECTIONS).map(([k,v]) => `${k}. ${v.title}`).join('\n');
    await tgSend(chatId, `📖 kie.ai API 레퍼런스\n\n${list}\n\n사용법: kie <번호 또는 키워드>\n예: kie 3, kie 가사, kie 모델`, { parse_mode: '' });
    return;
  }

  /* 번호로 직접 조회 */
  const directKey = Object.keys(KIE_SECTIONS).find(k => k === arg || k === arg.replace('번',''));
  /* 키워드 매칭 */
  const keywordKey = !directKey ? Object.entries(KIE_SECTIONS).find(([k,v]) =>
    v.keywords.some(kw => arg.toLowerCase().includes(kw))
  )?.[0] : null;

  const matchKey = directKey || keywordKey;
  if (!matchKey) {
    await tgSend(chatId, `❓ "${arg}"에 해당하는 섹션을 찾을 수 없어요.\n\nkie 를 입력하면 전체 목록을 볼 수 있어요.`, { parse_mode: '' });
    return;
  }

  const section = KIE_SECTIONS[matchKey];

  /* GitHub에서 KIE_API_REFERENCE.md 원본 읽기 */
  try {
    const _ghHeaders = GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github.raw' } : {};
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/KIE_API_REFERENCE.md?ref=main`, { headers: _ghHeaders });
    if (!r.ok) throw new Error('MD 파일 로드 실패');
    const md = await r.text();

    /* 섹션 추출: "## N. 제목" ~ 다음 "## " 사이 */
    const sectionNum = matchKey.split('.')[0];
    const subNum = matchKey.includes('.') ? matchKey : null;

    let pattern, content;
    if (subNum) {
      /* 서브섹션: ### N.M 제목 */
      pattern = new RegExp(`### ${matchKey.replace('.','\\.')}[^\\n]*\\n([\\s\\S]*?)(?=###|## \\d|$)`);
    } else {
      /* 메인 섹션: ## N. 제목 */
      pattern = new RegExp(`## ${sectionNum}\\.\\s[^\\n]*\\n([\\s\\S]*?)(?=\\n## \\d|$)`);
    }

    const match = md.match(pattern);
    content = match ? match[0].trim() : null;

    if (!content) {
      content = `📖 ${matchKey}. ${section.title}\n\n(섹션 내용을 추출할 수 없었어요. KIE_API_REFERENCE.md를 직접 확인해주세요.)`;
    }

    /* 4096자 제한 (텔레그램) */
    if (content.length > 4000) content = content.slice(0, 4000) + '\n\n... (이하 생략, MD 파일 참조)';

    await tgSend(chatId, content, { parse_mode: '' });

    /* 카카오에도 전송 (300자 요약) */
    try {
      const summary = `📖 kie.ai: ${matchKey}. ${section.title}\n\n${content.replace(/[#*`|]/g,'').slice(0, 250)}`;
      await fetch(`${BASE}/api/kakao-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
        body: JSON.stringify({ text: summary }),
      });
    } catch {}

  } catch (e) {
    await tgSend(chatId, `❌ API 문서 로드 실패: ${e.message}\n\n직접 확인: KIE_API_REFERENCE.md`, { parse_mode: '' });
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

    /* 자연어 → 명령 매핑 */
    const NL_MAP = [
      { re: /진행.*(어때|어디|상황|상태|됐|됨|완료|얼마)|어디.*까지|다\s*됐|끝났|작업.*추적/i, cmd: '진행상황' },
      { re: /PR.*(있|목록|확인|열린|리스트)|풀리퀘/i, cmd: 'PR' },
      { re: /머지.*(해|하자|ㄱ|go)|합쳐/i, cmd: '머지' },
      { re: /서버.*(상태|어때|정상)|사이트.*(되|살아|정상)|헬스/i, cmd: '상태' },
      { re: /QA|점검|테스트.*전체|버그.*찾/i, cmd: 'QA' },
      { re: /구현.*현황|뭐.*했|뭐.*만들|기능.*목록|어디.*까지.*구현|작업.*내역/i, cmd: '작업' },
    ];
    if (!COMMANDS[cmd]) {
      const full = text.toLowerCase();
      for (const nl of NL_MAP) {
        if (nl.re.test(full)) { cmd = nl.cmd; arg = ''; break; }
      }
    }

    /* 명령 실행 */
    const handler = COMMANDS[cmd];
    if (handler) {
      try {
        await handler(chatId, arg);
      } catch (e) {
        console.error('[TG CMD error]', cmd, e.message);
        await tgSend(chatId, `❌ 명령 실행 오류: ${e.message}`);
      }
    } else {
      await tgSend(chatId, `❓ 알 수 없는 명령: \`${cmd}\`\n"도움" 을 입력하면 명령어 목록을 볼 수 있어요.`);
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
