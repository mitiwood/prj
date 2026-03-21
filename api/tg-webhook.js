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

🛠 *개발*
수정 <지시사항> — AI 코드 수정 + PR
PR — PR 목록 / 머지 <번호> — 머지
QA — 전체 코드 점검 + 리포트
진행상황 — 작업 추적

📋 *기획*
기획 <기능설명> — 기능 요구사항 Issue 등록
백로그 — 미완료 Issue 목록
버그 <설명> — 버그 리포트 등록

🎨 *디자인*
디자인 <지시> — UI/CSS 수정 요청

📊 *사용량*
사용량 — 전체 통계 대시보드
일간 — 오늘 활동 리포트
주간 — 최근 7일 리포트

💡 슬래시(/) 없이 바로 입력하세요!
⏰ ${ts()}`;
  await tgSend(chatId, help);
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
    const { count: trackCount } = await sb('GET', '/tracks?select=id&limit=0');
    const { count: publicCount } = await sb('GET', '/tracks?is_public=eq.true&select=id&limit=0');
    let userCount = '?', commentCount = '?', payCount = '?';
    try { userCount = (await sb('GET', '/users?select=id&limit=0')).count ?? '?'; } catch {}
    try { commentCount = (await sb('GET', '/comments?select=id&limit=0')).count ?? '?'; } catch {}
    try { payCount = (await sb('GET', '/payments?select=id&limit=0')).count ?? '?'; } catch {}

    const today = new Date().toISOString().split('T')[0];
    let todayTracks = 0, todayUsers = 0, todayComments = 0;
    try { todayTracks = (await sb('GET', `/tracks?created_at=gte.${today}&select=id&limit=100`)).data.length; } catch {}
    try { todayUsers = (await sb('GET', `/users?created_at=gte.${today}&select=id&limit=100`)).data.length; } catch {}
    try { todayComments = (await sb('GET', `/comments?created_at=gte.${today}&select=id&limit=100`)).data.length; } catch {}

    const msg = [
      `📊 사용량 대시보드`,
      `⏰ ${ts()}`,
      ``,
      `┌──────────┬────────┬────────┐`,
      `│  항목    │ 전체   │ 오늘   │`,
      `├──────────┼────────┼────────┤`,
      `│ 🎵 트랙  │ ${String(trackCount ?? '?').padStart(5)} │ ${String(todayTracks).padStart(5)} │`,
      `├──────────┼────────┼────────┤`,
      `│ 👥 사용자│ ${String(userCount).padStart(5)} │ ${String(todayUsers).padStart(5)} │`,
      `├──────────┼────────┼────────┤`,
      `│ 💬 댓글  │ ${String(commentCount).padStart(5)} │ ${String(todayComments).padStart(5)} │`,
      `├──────────┼────────┼────────┤`,
      `│ 💰 결제  │ ${String(payCount).padStart(5)} │   -   │`,
      `├──────────┼────────┼────────┤`,
      `│ 🌐 공개  │ ${String(publicCount ?? '?').padStart(5)} │       │`,
      `└──────────┴────────┴────────┘`,
    ].join('\n');
    await tgSend(chatId, msg, { parse_mode: '' });
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
