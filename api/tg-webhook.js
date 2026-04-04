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
 *   /센트리, /sentry      → Sentry 에러 현황
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
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const GH_TOKEN   = process.env.GITHUB_TOKEN || '';
const GH_REPO    = 'mitiwood/ai-music-studio';
const BASE       = 'https://ddinggok.com';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const KIE_KEY    = process.env.KIE_API_KEY || '';
const TOSS_KEY   = process.env.TOSS_CLIENT_KEY || '';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '';
const VERCEL_PROJECT = process.env.VERCEL_PROJECT || '';

/* ── 유틸 ── */
function mdToHtml(t) {
  /* Markdown *bold* → HTML <b>bold</b>, `code` → <code>code</code> */
  return t.replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
}
async function tgSend(chatId, text, opts = {}) {
  if (!BOT_TOKEN) return;
  const pm = 'parse_mode' in opts ? opts.parse_mode : 'HTML';
  const finalText = pm === 'HTML' ? mdToHtml(text) : text;
  const payload = {
    chat_id: chatId,
    text: finalText,
    disable_notification: !!opts.silent,
  };
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
    `━━ 🧠 AI 에이전트 (자동 분류) ━━`,
    `자연어로 말하면 자동으로 적합한 에이전트가 처리합니다:`,
    ``,
    `🎵 음악생성 에이전트 — "음악 생성 버그 확인해"`,
    `🎨 디자인 에이전트 — "데이모드 색상 수정해"`,
    `👥 커뮤니티 에이전트 — "커뮤니티 좋아요 안 돼"`,
    `⚙️ 설정 에이전트 — "설정 페이지 고쳐"`,
    `🧪 QA 에이전트 — "QA 점검해" / "버그 찾아"`,
    `📋 PM 에이전트 — "진행상황" / "작업 내역"`,
    ``,
    `━━ 📊 모니터링 (7) ━━`,
    `상태 — 서버+DB+사이트 리포트`,
    `헬스 — API/DB 전체 점검 (응답속도 포함)`,
    `센트리 — Sentry 에러 현황 (미해결 이슈)`,
    `트랙 [N] — 최근 트랙 (기본 10곡)`,
    `유저 — 유저 통계+최근 가입자`,
    `댓글 [트랙ID] — 최근 댓글`,
    `배포 — 사이트 헬스체크+응답속도`,
    ``,
    `━━ 📊 인사이트 (4) ━━`,
    `인기곡 [주간|월간] — 인기 트랙 TOP 10`,
    `순위 — 크리에이터 랭킹`,
    `플랫폼 — 서비스 성장 대시보드`,
    `장르 — 생성 모드별 분석`,
    ``,
    `━━ 📝 콘텐츠 관리 (6) ━━`,
    `공지 <내용> — 인앱 공지 등록`,
    `공지삭제 — 공지 비활성화`,
    `삭제 <트랙ID> — 트랙 삭제`,
    `공개 <트랙ID> — 트랙 공개 전환`,
    `비공개 <트랙ID> — 트랙 비공개`,
    `댓글삭제 <댓글ID> — 댓글 삭제`,
    ``,
    `━━ 📣 알림 (2) ━━`,
    `알림 <메시지> — 전체 웹 푸시 발송`,
    `채팅공지 <메시지> — 커뮤니티 채팅에 관리자 공지`,
    ``,
    `━━ 🛠 개발 (7) ━━`,
    `수정 <지시> — AI 자동 코드 수정 (아래 상세)`,
    `디자인 <지시> — UI/CSS만 수정 (기능 변경 X)`,
    `PR — 열린 PR 목록`,
    `머지 [번호] — PR 머지 (번호 없으면 자동탐색)`,
    `청소 [일수] — stale 브랜치 정리 (기본 7일)`,
    `QA — 전체 코드 점검+봇 리포트`,
    `tc [카테고리] [번호] — QA 테스트케이스 조회 (음악/디자인/커뮤니티)`,
    `진행상황 — GitHub Action 작업 추적`,
    `취소 — 진행 중인 Claude 작업 취소`,
    `세션 — 현재 활성 세션 확인`,
    `닫아/끝/완료 — 활성 세션 종료`,
    ``,
    `  📌 수정 명령어 사용법:`,
    `  수정 [화면] <하고 싶은 것을 자연어로>`,
    `  `,
    `  [화면] 태그를 붙이면 해당 영역만 수정!`,
    `  → 속도 빠르고 API 비용 5~10배 절약`,
    `  `,
    `  💰 예상 비용:`,
    `  [화면] 태그 사용 시: ~$0.05~0.15/건`,
    `  태그 없이 전체 탐색: ~$0.50~1.00/건`,
    `  `,
    `  예시 (태그 사용 권장):`,
    `  수정 [설정] 이용약관 링크 색상 변경`,
    `  수정 [풀플레이어] 볼륨 슬라이더 추가해줘`,
    `  수정 [커뮤채팅] 메시지 삭제 기능 추가`,
    `  수정 [css플레이어] 다크모드 배경색 수정`,
    `  수정 [텔레봇] 도움말 텍스트 변경`,
    `  수정 다크모드에서 텍스트 안 보임 (태그 없이도 OK)`,
    `  `,
    `  💬 대화형 세션:`,
    `  수정 명령 후 후속 메시지는 같은 이슈에 자동 추가!`,
    `  "좀 더 진하게" → Claude가 이전 맥락 읽고 재수정`,
    `  세션 종료: 닫아 / 끝 / 완료`,
    `  `,
    `  지원 화면 태그 (65개):`,
    `  `,
    `  메인뷰: 생성, 히스토리, 커뮤니티, 설정`,
    `  설정: 테마, 언어, 출석, 접근성, 푸시, 약관`,
    `  플레이어: 미니플레이어, 풀플레이어, 큐, 가사`,
    `  시트: 트랙상세, 편집, 공유, DM, 로그인, 신고`,
    `  리믹스: 리믹스, 연장, 커버, 스타일리믹스`,
    `          리마스터, 보컬, 보컬제거, 노래방, 스템`,
    `  커뮤: 피드, 채팅, 커뮤채팅, 리더보드, 챌린지`,
    `        크리에이터, 팔로우, 추천, 별점, 댓글, 검색`,
    `  기타: 프로필, 콜라보, 알림, 다시작곡, 공지`,
    `        온보딩, 헤더, 탭바, 플레이리스트`,
    `  생성: 장르, 프리셋, 작사, MV, 유튜브, 다운로드`,
    `  결제: 플랜, 크레딧, 결제`,
    `  CSS: css, css레이아웃, css플레이어, css커뮤니티`,
    `       css생성, css설정`,
    `  JS: js, js생성, js재생, js히스토리`,
    `      js커뮤니티, js인증`,
    `  API: api, 봇, 텔레봇, 카카오봇, 텔레그램, 카카오`,
    `  `,
    `  흐름: 이슈 생성 → Claude Code 자동 수정`,
    `        → main 푸시 → Vercel 배포 → 봇 알림`,
    ``,
    `━━ 🔀 Git 관리 (6) ━━`,
    `브랜치 — 원격 브랜치 목록`,
    `브랜치삭제 <이름> — 브랜치 삭제`,
    `이슈 [open|closed] — 이슈 목록`,
    `이슈닫기 <번호> — 이슈 닫기`,
    `PR닫기 <번호> — PR 닫기 + 브랜치 삭제`,
    `커밋 [N] — 최근 커밋 (기본 10)`,
    ``,
    `━━ 📋 기획 (3) ━━`,
    `기획 <기능설명> — Issue 등록`,
    `백로그 — 미완료 Issue 목록`,
    `버그 <설명> — 버그 리포트 등록`,
    ``,
    `━━ 📊 사용량 (3) ━━`,
    `사용량 — 전체 서비스 (DB+API+Vercel+유저별)`,
    `일간 — 오늘 활동 리포트`,
    `주간 — 최근 7일 리포트`,
    ``,
    `━━ 🎵 음악 생성 (5) ━━`,
    `커스텀 <가사> — 가사 입력 생성`,
    `심플 <설명> — 설명만으로 생성`,
    `유튜브 <스타일> — 스타일 기반 생성`,
    `MV <트랙ID> — 뮤직비디오 생성`,
    `생성 <가사> — 고급 (옵션: -t -s -v -i -m)`,
    ``,
    `━━ 📖 레퍼런스 (3) ━━`,
    `kie [질문] — kie.ai API 문서 조회`,
    `작업 [카테고리] — 구현 현황 (8카테고리 50항목)`,
    `mc [파일명] — 프로젝트 MD 파일 조회 (CLAUDE.md 등)`,
    `고도화 — 진행률 조회 / 고도화 진행 <지시> — AI 구현`,
    ``,
    `━━ 🧪 데이터 (4) ━━`,
    `더미 — 아이돌 더미 데이터 현황`,
    `더미추가 — 아이돌 트랙+팔로우 삽입`,
    `더미삭제 — 아이돌 더미 데이터 전체 삭제`,
    `채팅초기화 — 커뮤니티 채팅 메시지 전체 삭제`,
    ``,
    `💡 슬래시(/) 없이 바로 입력!`,
    `💬 자연어도 OK (예: "뭐 했어", "서버 괜찮아?")`,
  ].join('\n');
  await tgSend(chatId, help, { parse_mode: '' });
};

/* /센트리, /sentry — Sentry 에러 현황 */
const SENTRY_TOKEN = process.env.SENTRY_AUTH_TOKEN || '';
const SENTRY_ORG = process.env.SENTRY_ORG || 'kenny-17';
const SENTRY_PROJ = process.env.SENTRY_PROJECT || 'javascript';

async function sentryApi(path) {
  if (!SENTRY_TOKEN) throw new Error('SENTRY_AUTH_TOKEN 미설정');
  const r = await fetch(`https://sentry.io/api/0${path}`, {
    headers: { Authorization: `Bearer ${SENTRY_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Sentry ${r.status}`);
  return r.json();
}

COMMANDS['센트리'] = COMMANDS['sentry'] = COMMANDS['에러현황'] = async (chatId) => {
  try {
    const issues = await sentryApi(`/projects/${SENTRY_ORG}/${SENTRY_PROJ}/issues/?query=is:unresolved&sort=date&limit=10`);
    if (!Array.isArray(issues) || issues.length === 0) {
      await tgSend(chatId, '🛡 Sentry 에러 현황\n\n미해결 이슈가 없습니다! ✅\n\n⏰ ' + ts(), { parse_mode: '' });
      return;
    }

    const lines = [
      '🛡 Sentry 에러 현황',
      '미해결 이슈: ' + issues.length + '건',
      '',
    ];

    issues.forEach((iss, i) => {
      const lvl = (iss.level || 'error').toUpperCase();
      const icon = lvl === 'FATAL' ? '💀' : lvl === 'ERROR' ? '🔴' : lvl === 'WARNING' ? '🟡' : '🔵';
      const ago = _sentryAgo(iss.lastSeen);
      lines.push(
        `${icon} #${i + 1} [${lvl}] ${(iss.title || '').slice(0, 50)}`,
        `   ${(iss.culprit || '').slice(0, 40)}`,
        `   이벤트: ${iss.count || 0}회 | 최근: ${ago}`,
        ''
      );
    });

    lines.push('⏰ ' + ts());
    await tgSend(chatId, lines.join('\n'), { parse_mode: '' });
  } catch (e) {
    await tgSend(chatId, '🛡 Sentry 조회 실패\n\n' + e.message + '\n\n⏰ ' + ts(), { parse_mode: '' });
  }
};

function _sentryAgo(d) {
  if (!d) return '-';
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return m + '분 전';
  const h = Math.floor(m / 60);
  if (h < 24) return h + '시간 전';
  return Math.floor(h / 24) + '일 전';
}

/* /헬스체크 — API/DB 전체 점검 (병렬 실행) */
COMMANDS['헬스'] = COMMANDS['health'] = COMMANDS['점검'] = async (chatId) => {
  async function chk(name, fn) {
    try { const t0=Date.now(); const info=await fn(); return `✅ ${name} — ${Date.now()-t0}ms${info?' '+info:''}`; }
    catch(e) { return `❌ ${name} — ${e.message.slice(0,60)}`; }
  }
  const checks = await Promise.all([
    chk('Supabase DB', async()=>{ const{count}=await sb('GET','/tracks?select=id&limit=0'); return `(${count}곡)`; }),
    chk('Supabase Users', async()=>{ const{count}=await sb('GET','/users?select=id&limit=0'); return `(${count}명)`; }),
    chk('kie.ai API', async()=>{ const r=await fetch('https://api.kie.ai/api/v1/generate/record-info?taskId=test',{headers:{Authorization:`Bearer ${KIE_KEY}`}}); if(r.status>=500)throw new Error('HTTP '+r.status); return `(HTTP ${r.status})`; }),
    chk('사이트', async()=>{ const r=await fetch(BASE,{method:'HEAD'}); if(r.status>=400)throw new Error('HTTP '+r.status); return ''; }),
    chk('텔레그램 봇', async()=>{ const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`); const d=await r.json(); if(!d.ok)throw new Error(d.description); return ''; }),
    chk('카카오 알림', async()=>{ const r=await fetch(`${BASE}/api/kakao-notify`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"text":""}'}); if(r.status>=500)throw new Error('HTTP '+r.status); return ''; }),
    GH_TOKEN ? chk('GitHub API', async()=>{ await ghApi('GET',''); return ''; }) : Promise.resolve('⚠️ GitHub API — 토큰 미설정'),
    SENTRY_TOKEN ? chk('Sentry', async()=>{ const issues=await sentryApi(`/projects/${SENTRY_ORG}/${SENTRY_PROJ}/issues/?query=is:unresolved&limit=1`); return `(미해결 ${Array.isArray(issues)?issues.length:'?'}건)`; }) : Promise.resolve('⚠️ Sentry — 토큰 미설정'),
  ]);

  const ok = checks.filter(c => c.startsWith('✅')).length;
  const total = checks.length;
  const emoji = ok === total ? '💚' : ok >= total-1 ? '💛' : '🔴';

  await tgSend(chatId, [
    `${emoji} 시스템 헬스체크 (${ok}/${total})`,
    '',
    ...checks,
    '',
    `⏰ ${ts()}`,
  ].join('\n'), { parse_mode: '' });
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
      body: JSON.stringify({ title: '공지사항', body: arg, type: 'info' }),
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

/* ── 경량 직접 수정 (Anthropic API + GitHub Contents API) ── */
const _LIGHT_FIX_FILES = {
  'css': ['index.html'],
  '테마': ['index.html'],
  'api': [], /* API 파일은 경량 수정 가능하지만 index.html은 너무 큼 */
  'js': ['js/create-enhance.js','js/model-profiles.js','js/prompt-engine.js','js/stem-mixer.js','js/history-manager.js'],
};

async function ghReadFile(path) {
  const data = await ghApi('GET', `/contents/${encodeURIComponent(path)}?ref=main`);
  if (!data || !data.content) return null;
  return { content: Buffer.from(data.content, 'base64').toString('utf-8'), sha: data.sha, size: data.size || 0 };
}

async function ghWriteFile(path, content, sha, message) {
  return ghApi('PUT', `/contents/${encodeURIComponent(path)}`, {
    message, content: Buffer.from(content, 'utf-8').toString('base64'), sha, branch: 'main',
  });
}

async function claudeQuickFix(fileContent, instruction, fileName) {
  if (!ANTHROPIC_KEY) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40000); /* 40초 타임아웃 */
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [{ role: 'user', content: `파일: ${fileName}\n\n수정 지시: ${instruction}\n\n현재 코드:\n\`\`\`\n${fileContent.slice(0, 30000)}\n\`\`\`\n\n수정된 전체 코드만 반환해주세요. 설명 없이 코드만. 기존 기능을 절대 제거하지 마세요.` }],
      }),
      signal: ctrl.signal,
    });
    const d = await r.json();
    if (d.error) return null;
    const text = d.content?.find(c => c.type === 'text')?.text || '';
    /* 코드블록 추출 */
    const codeMatch = text.match(/```(?:\w+)?\s*\n([\s\S]*?)```/);
    return codeMatch ? codeMatch[1] : text;
  } catch (e) { console.warn('[claudeQuickFix]', e.message); return null; }
  finally { clearTimeout(timer); }
}

async function directFix(chatId, arg, fileName) {
  await tgSend(chatId, '⚡ 경량 수정 모드\n\n📄 ' + fileName + '\n📝 ' + arg.replace(/[*_`\[]/g, '').slice(0, 60) + '\n\n🤖 Claude가 직접 수정 중...', { parse_mode: '' });
  try {
    /* 1. 파일 읽기 */
    const file = await ghReadFile(fileName);
    if (!file) throw new Error('파일을 읽을 수 없어요: ' + fileName);
    if (file.size > 500000) throw new Error('파일이 너무 커요 (' + Math.round(file.size/1024) + 'KB). Actions로 전환합니다.');

    /* 2. Claude 수정 */
    const fixed = await claudeQuickFix(file.content, arg, fileName);
    if (!fixed) throw new Error('Claude 수정 실패. Actions로 전환합니다.');
    if (fixed.length < file.content.length * 0.5) throw new Error('수정 결과가 너무 짧아요. 안전을 위해 Actions로 전환합니다.');

    /* 3. 커밋 */
    const commitMsg = 'fix: ' + arg.replace(/[*_`\[\]]/g, '').slice(0, 50) + ' (텔레봇 경량수정)';
    await ghWriteFile(fileName, fixed, file.sha, commitMsg);

    await tgSend(chatId, '✅ 경량 수정 완료!\n\n📄 ' + fileName + '\n📝 ' + commitMsg + '\n🚀 Vercel 배포 시작\n🔗 https://ddinggok.com', { parse_mode: '' });
    return true;
  } catch (e) {
    console.warn('[directFix]', e.message);
    await tgSend(chatId, '⚠️ 경량 수정 실패: ' + e.message.slice(0, 80) + '\n\n🔄 GitHub Actions로 전환합니다...', { parse_mode: '' });
    return false;
  }
}

function _isLightFixable(arg) {
  const tagMatch = arg.match(/^\[([^\]]+)\]/);
  if (!tagMatch) return null;
  const screen = tagMatch[1].trim().toLowerCase();
  /* API 파일 직접 수정 */
  if (screen === 'api') {
    const fileMatch = arg.match(/api\/[\w-]+\.js/);
    if (fileMatch) return fileMatch[0];
  }
  /* JS 모듈 직접 수정 */
  if (screen === 'js') {
    const fileMatch = arg.match(/js\/[\w-]+\.js/);
    if (fileMatch) return fileMatch[0];
  }
  /* 작은 JS 파일 매핑 */
  const jsFiles = _LIGHT_FIX_FILES[screen];
  if (jsFiles && jsFiles.length === 1 && !jsFiles[0].includes('index.html')) return jsFiles[0];
  return null;
}

/* ── 대화형 세션 관리 (GitHub Issue = 세션 스토어) ── */
/* 열린 claude-fix 이슈 중 가장 최근 것 = 활성 세션 */
async function getActiveSession(chatId) {
  if (!GH_TOKEN) return null;
  try {
    const issues = await ghApi('GET', '/issues?labels=claude-fix&state=open&sort=created&direction=desc&per_page=1');
    if (Array.isArray(issues) && issues.length > 0) {
      return { issue_number: issues[0].number, title: issues[0].title };
    }
    return null;
  } catch (e) { console.warn('[session-get]', e.message); return null; }
}
/* 세션 생성 = Issue 생성 (COMMANDS['수정']에서 직접 처리하므로 여기서는 no-op) */
async function createSession(chatId, issueNumber) { /* Issue 생성이 곧 세션 생성 */ }
/* 세션 종료 = Issue 닫기 */
async function closeSession(chatId, issueNumber) {
  try {
    await ghApi('PATCH', `/issues/${issueNumber}`, { state: 'closed', state_reason: 'completed' });
    console.log(`[session-close] Issue #${issueNumber} closed`);
  } catch (e) {
    console.error('[session-close] FAILED:', issueNumber, e.message);
    /* 에러 발생 시 사용자에게 알림 */
    if (chatId) await tgSend(chatId, `⚠️ Issue #${issueNumber} 닫기 실패: ${e.message?.slice(0,60)}`, { parse_mode: '' }).catch(() => {});
  }
}

/* ── GitHub API 헬퍼 ── */
async function ghApi(method, path, body = null) {
  if (!GH_TOKEN) throw new Error('GITHUB_TOKEN 미설정');
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'kenny-music-bot',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}${path}`, opts);
  const txt = await r.text();
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${txt.slice(0, 150)}`);
  return txt ? JSON.parse(txt) : {};
}

/* 수정 <지시사항> — GitHub Issue 생성 → Claude Code Action 트리거 */
COMMANDS['수정'] = COMMANDS['fix'] = COMMANDS['edit'] = COMMANDS['고쳐'] = COMMANDS['변경'] = COMMANDS['바꿔'] = COMMANDS['수정해'] = COMMANDS['수정해줘'] = async (chatId, arg) => {
  if (!arg) return tgSend(chatId, '⚠️ 사용법: 수정 [화면] <지시사항>\n\n[화면] 태그를 붙이면 해당 영역만 수정해서 빠르고 저렴해요!\n\n예시:\n수정 [설정] 이용약관 링크 수정\n수정 [플레이어] 볼륨 슬라이더 추가\n수정 [커뮤니티] 댓글 정렬 최신순으로\n수정 [css] 다크모드 배경색 변경\n수정 [봇] 도움말 텍스트 수정\n\n지원 화면: 생성, 히스토리, 커뮤니티, 설정, 플레이어, 공유, 로그인, 리믹스, 노래방, 보컬, 공지, 알림, 프로필, 채팅, 플랜, css, js, api, 봇\n\n태그 없이도 사용 가능 (전체 탐색, 비용 높음)');
  if (!GH_TOKEN) return tgSend(chatId, '⚠️ GITHUB\\_TOKEN 환경변수가 설정되지 않았어요.\nVercel 환경변수에 추가해주세요.');

  /* ── 경량 수정 시도 (작은 파일 + Anthropic API 직접) ── */
  const _lightFile = ANTHROPIC_KEY ? _isLightFixable(arg) : null;
  if (_lightFile) {
    /* 활성 Actions 워크플로우가 있으면 경량 수정 거부 */
    let _actionsRunning = false;
    try {
      const runs = await ghApi('GET', '/actions/runs?status=in_progress&per_page=1');
      if (runs?.workflow_runs?.length) _actionsRunning = true;
    } catch (e) {}

    if (!_actionsRunning) {
      const ok = await directFix(chatId, arg, _lightFile);
      if (ok) return; /* 성공 → 완료 */
    }
    /* 실패 또는 Actions 실행 중 → 아래 중량 경로로 폴백 */
  }

  await tgSend(chatId, `🔄 수정 요청을 처리 중...\n\n📝 "${arg.replace(/[*_`\[]/g, '')}"`, { parse_mode: '' });

  /* 기존 세션(열린 이슈) 자동 종료 */
  const prevSession = await getActiveSession(chatId);
  if (prevSession) {
    await closeSession(chatId, prevSession.issue_number);
  }

  try {
    /* 1) 라벨이 없으면 먼저 생성 (409 = 이미 존재 → 무시) */
    try {
      await ghApi('POST', '/labels', { name: 'claude-fix', color: '7c3aed', description: 'Claude Code 자동 수정' });
    } catch (e) {
      if (!e.message.includes('422') && !e.message.includes('already_exists')) console.warn('[label]', e.message);
    }

    /* 2) Issue 생성 (라벨 포함) */
    let issue;
    try {
      /* [화면] 태그가 있으면 제목에 보존, 없으면 태그 없이 생성 */
      const tagMatch = arg.match(/^\[([^\]]+)\]/);
      const titleTag = tagMatch ? `${tagMatch[0]} ` : '';
      const titleText = tagMatch ? arg.slice(tagMatch[0].length).trim().slice(0, 60) : arg.slice(0, 60);
      issue = await ghApi('POST', '/issues', {
        title: `${titleTag}${titleText}`,
        body: `## 수정 요청\n\n${arg}\n\n---\n> 텔레그램 봇에서 요청됨 · ${ts()}`,
        labels: ['claude-fix'],
      });
    } catch (labelErr) {
      /* 라벨 첨부 실패 시 이슈만 먼저 생성 후 라벨 별도 추가 */
      const tagMatch = arg.match(/^\[([^\]]+)\]/);
      const titleTag = tagMatch ? `${tagMatch[0]} ` : '';
      const titleText = tagMatch ? arg.slice(tagMatch[0].length).trim().slice(0, 60) : arg.slice(0, 60);
      issue = await ghApi('POST', '/issues', {
        title: `${titleTag}${titleText}`,
        body: `## 수정 요청\n\n${arg}\n\n---\n> 텔레그램 봇에서 요청됨 · ${ts()}`,
      });
      /* 이슈에 라벨 추가 (워크플로우 트리거 필수) */
      try {
        await ghApi('POST', `/issues/${issue.number}/labels`, { labels: ['claude-fix'] });
      } catch (e2) { console.warn('[label-add]', e2.message); }
    }
    const safeArg = arg.replace(/[*_`\[]/g, '');
    await tgSend(chatId, [
      `✅ 수정 요청 등록 완료!`,
      ``,
      `📋 Issue #${issue.number}`,
      `📝 ${safeArg}`,
      ``,
      `🤖 Claude Code가 자동으로 코드를 수정합니다.`,
      `완료되면 알림이 올 거예요.`,
      ``,
      `💬 후속 메시지를 보내면 같은 이슈에 추가돼요.`,
      `종료: 닫아 / 끝 / 완료`,
      ``,
      `🔗 ${issue.html_url}`,
    ].join('\n'), { parse_mode: '' });
  } catch (e) {
    const safeMsg = (e.message || 'unknown').replace(/[*_`\[\]]/g, '');
    await tgSend(chatId, `❌ Issue 생성 오류: ${safeMsg}`, { parse_mode: '' });
  }
};

/* 세션 종료 — 활성 세션 닫기 */
COMMANDS['닫아'] = COMMANDS['끝'] = COMMANDS['완료'] = COMMANDS['close'] = async (chatId) => {
  const session = await getActiveSession(chatId);
  if (!session) return tgSend(chatId, '현재 활성 세션이 없어요.', { parse_mode: '' });
  await closeSession(chatId, session.issue_number);
  await tgSend(chatId, `✅ 세션 종료! Issue #${session.issue_number} 닫힘.`, { parse_mode: '' });
};

/* 세션 — 현재 활성 세션 확인 */
COMMANDS['세션'] = COMMANDS['session'] = async (chatId) => {
  const session = await getActiveSession(chatId);
  if (!session) return tgSend(chatId, '현재 활성 세션이 없어요.\n"수정 [화면] 지시사항"으로 새 세션을 시작하세요.', { parse_mode: '' });
  await tgSend(chatId, `📋 활성 세션: Issue #${session.issue_number}\n\n후속 메시지를 보내면 같은 이슈에 추가돼요.\n종료: 닫아 / 끝 / 완료`, { parse_mode: '' });
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

/* 청소 — stale 브랜치 정리 */
COMMANDS['청소'] = COMMANDS['cleanup'] = async (chatId, arg) => {
  if (!GH_TOKEN) return tgSend(chatId, '⚠️ GITHUB_TOKEN 미설정', { parse_mode: '' });

  const days = parseInt(arg) || 7;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  await tgSend(chatId, `🧹 ${days}일 이상 된 stale 브랜치 검색 중...`, { parse_mode: '' });

  try {
    // Get all branches with claude/issue- or fix/issue- prefix
    const branches = await ghApi('GET', '/branches?per_page=100');
    const staleBranches = [];

    for (const b of branches) {
      if (!b.name.startsWith('claude/issue-') && !b.name.startsWith('fix/issue-')) continue;

      // Get branch last commit date
      try {
        const commit = await ghApi('GET', `/commits/${b.commit.sha}`);
        const commitDate = commit.commit.author.date;
        if (commitDate < cutoff) {
          staleBranches.push({ name: b.name, date: commitDate.slice(0, 10) });
        }
      } catch(e) { continue; }
    }

    if (!staleBranches.length) {
      return tgSend(chatId, `✅ ${days}일 이상 된 stale 브랜치가 없습니다.`, { parse_mode: '' });
    }

    // Delete stale branches
    let deleted = 0;
    for (const sb of staleBranches) {
      try {
        await ghApi('DELETE', `/git/refs/heads/${sb.name}`);
        deleted++;
      } catch(e) { /* skip protected branches */ }
    }

    await tgSend(chatId, [
      `🧹 브랜치 정리 완료`,
      ``,
      `삭제: ${deleted}/${staleBranches.length}개`,
      `기준: ${days}일 이상`,
      ``,
      ...staleBranches.slice(0, 10).map(b => `  ${b.name} (${b.date})`),
      staleBranches.length > 10 ? `  ... 외 ${staleBranches.length - 10}개` : '',
    ].join('\n'), { parse_mode: '' });
  } catch(e) {
    await tgSend(chatId, `❌ 브랜치 정리 실패: ${e.message}`, { parse_mode: '' });
  }
};

/* 인기곡 — 좋아요+재생 기준 인기 트랙 */
COMMANDS['인기곡'] = COMMANDS['인기'] = COMMANDS['trending'] = COMMANDS['핫'] = async (chatId, arg) => {
  const period = (arg || '').includes('주') ? 7 : (arg || '').includes('월') ? 30 : 1;
  const label = period === 1 ? '24시간' : period === 7 ? '7일' : '30일';

  try {
    const since = new Date(Date.now() - period * 86400000).toISOString();
    const { data: tracks } = await sb('GET', `/tracks?is_public=eq.true&created_at=gte.${since}&order=comm_likes.desc,comm_plays.desc&limit=10&select=title,owner_name,comm_likes,comm_plays,gen_mode,created_at`);

    if (!tracks?.length) return tgSend(chatId, `최근 ${label} 인기곡이 없습니다.`, { parse_mode: '' });

    let msg = `🔥 인기곡 TOP ${tracks.length} (${label})\n\n`;
    tracks.forEach((t, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const mode = t.gen_mode === 'custom' ? '🎹' : t.gen_mode === 'simple' ? '🎵' : '🎶';
      msg += `${medal} ${t.title || '무제'}\n`;
      msg += `   ${mode} ${t.owner_name || '?'} · ❤️${t.comm_likes || 0} · ▶️${t.comm_plays || 0}\n\n`;
    });
    msg += `💡 인기곡 주간: "인기곡 주간" / 월간: "인기곡 월간"`;
    await tgSend(chatId, msg, { parse_mode: '' });
  } catch(e) {
    await tgSend(chatId, `❌ 인기곡 조회 실패: ${e.message}`, { parse_mode: '' });
  }
};

/* 순위 — 크리에이터 랭킹 TOP 10 */
COMMANDS['순위'] = COMMANDS['랭킹'] = COMMANDS['ranking'] = async (chatId, arg) => {
  try {
    const { data: tracks } = await sb('GET', '/tracks?is_public=eq.true&select=owner_name,comm_likes,comm_plays');
    if (!tracks?.length) return tgSend(chatId, '트랙 데이터가 없습니다.', { parse_mode: '' });

    // Aggregate by creator
    const creators = {};
    for (const t of tracks) {
      const name = t.owner_name || '?';
      if (!creators[name]) creators[name] = { tracks: 0, likes: 0, plays: 0 };
      creators[name].tracks++;
      creators[name].likes += (t.comm_likes || 0);
      creators[name].plays += (t.comm_plays || 0);
    }

    // Sort by score (likes*3 + plays)
    const ranked = Object.entries(creators)
      .map(([name, s]) => ({ name, ...s, score: s.likes * 3 + s.plays }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    let msg = `🏆 크리에이터 랭킹 TOP ${ranked.length}\n\n`;
    ranked.forEach((c, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      msg += `${medal} ${c.name}\n`;
      msg += `   🎵${c.tracks}곡 · ❤️${c.likes} · ▶️${c.plays}\n\n`;
    });
    await tgSend(chatId, msg, { parse_mode: '' });
  } catch(e) {
    await tgSend(chatId, `❌ 랭킹 조회 실패: ${e.message}`, { parse_mode: '' });
  }
};

/* 플랫폼 — 서비스 인사이트 대시보드 */
COMMANDS['플랫폼'] = COMMANDS['인사이트'] = COMMANDS['insight'] = async (chatId, arg) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    // Parallel queries
    const [totalRes, userRes, todayRes, todayUserRes, weekRes, publicRes] = await Promise.all([
      sb('GET', '/tracks?select=id&limit=0'),
      sb('GET', '/users?select=id&limit=0'),
      sb('GET', `/tracks?created_at=gte.${today}&select=id`),
      sb('GET', `/users?created_at=gte.${today}&select=id`),
      sb('GET', `/tracks?created_at=gte.${weekAgo}&select=id`),
      sb('GET', '/tracks?is_public=eq.true&select=comm_likes,comm_plays'),
    ]);

    const totalTracks = totalRes.count || 0;
    const totalUsers = userRes.count || 0;
    const todayTracks = todayRes.data?.length || 0;
    const todayUsers = todayUserRes.data?.length || 0;
    const weekTracks = weekRes.data?.length || 0;
    const publicTracks = publicRes.data || [];

    const totalLikes = publicTracks.reduce((s, t) => s + (t.comm_likes || 0), 0);
    const totalPlays = publicTracks.reduce((s, t) => s + (t.comm_plays || 0), 0);
    const avgLikes = publicTracks.length ? (totalLikes / publicTracks.length).toFixed(1) : 0;

    const msg = [
      '📊 플랫폼 인사이트',
      '',
      '━━ 전체 현황 ━━',
      `🎵 총 트랙: ${totalTracks.toLocaleString()}곡`,
      `👤 총 유저: ${totalUsers.toLocaleString()}명`,
      `❤️ 총 좋아요: ${totalLikes.toLocaleString()}`,
      `▶️ 총 재생: ${totalPlays.toLocaleString()}`,
      '',
      '━━ 오늘 ━━',
      `🆕 신규 트랙: ${todayTracks}곡`,
      `🆕 신규 가입: ${todayUsers}명`,
      '',
      '━━ 주간 ━━',
      `📈 주간 트랙: ${weekTracks}곡`,
      `📊 곡당 평균 좋아요: ${avgLikes}`,
      '',
      `⏰ ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
    ].join('\n');

    await tgSend(chatId, msg, { parse_mode: '' });
  } catch(e) {
    await tgSend(chatId, `❌ 인사이트 조회 실패: ${e.message}`, { parse_mode: '' });
  }
};

/* 장르 — 생성 모드별 트랙 분석 */
COMMANDS['장르'] = COMMANDS['모드'] = COMMANDS['genre'] = async (chatId, arg) => {
  try {
    const { data: tracks } = await sb('GET', '/tracks?is_public=eq.true&select=gen_mode,comm_likes,comm_plays');
    if (!tracks?.length) return tgSend(chatId, '트랙 데이터가 없습니다.', { parse_mode: '' });

    const modes = {};
    for (const t of tracks) {
      const mode = t.gen_mode || 'unknown';
      if (!modes[mode]) modes[mode] = { count: 0, likes: 0, plays: 0 };
      modes[mode].count++;
      modes[mode].likes += (t.comm_likes || 0);
      modes[mode].plays += (t.comm_plays || 0);
    }

    const modeLabels = { simple: '🎵 심플모드', custom: '🎹 커스텀모드', extend: '🔄 확장모드', unknown: '❓ 기타' };
    const total = tracks.length;

    let msg = '🎼 생성 모드별 분석\n\n';
    const sorted = Object.entries(modes).sort((a, b) => b[1].count - a[1].count);

    for (const [mode, s] of sorted) {
      const pct = ((s.count / total) * 100).toFixed(0);
      const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
      const avgLikes = s.count ? (s.likes / s.count).toFixed(1) : 0;
      msg += `${modeLabels[mode] || mode}\n`;
      msg += `${bar} ${pct}% (${s.count}곡)\n`;
      msg += `❤️ 평균 ${avgLikes} · ▶️ 총 ${s.plays}\n\n`;
    }

    msg += `📊 전체 ${total}곡 기준`;
    await tgSend(chatId, msg, { parse_mode: '' });
  } catch(e) {
    await tgSend(chatId, `❌ 장르 분석 실패: ${e.message}`, { parse_mode: '' });
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
urllib.request.urlopen(urllib.request.Request('https://ddinggok.com/api/telegram', data=tg, headers={'Content-Type':'application/json; charset=utf-8','Authorization':'Bearer ${ADMIN_SECRET}'}))

# Kakao
kk = json.dumps({'text': msg}, ensure_ascii=False).encode('utf-8')
urllib.request.urlopen(urllib.request.Request('https://ddinggok.com/api/kakao-notify', data=kk, headers={'Content-Type':'application/json; charset=utf-8'}))
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

/* 취소 — 진행 중인 GitHub Actions 워크플로우 취소 */
COMMANDS['취소'] = COMMANDS['cancel'] = COMMANDS['중지'] = async (chatId, arg) => {
  if (!GH_TOKEN) return tgSend(chatId, '⚠️ GITHUB_TOKEN 미설정', { parse_mode: '' });
  try {
    const runs = await ghApi('GET', '/actions/runs?status=in_progress&per_page=10');
    const items = (runs.workflow_runs || []).filter(r => r.name === 'Claude Code Auto-Fix');
    if (!items.length) {
      return tgSend(chatId, '✅ 현재 진행 중인 Claude 작업이 없습니다.', { parse_mode: '' });
    }
    let msg = '';
    for (const run of items) {
      try {
        await ghApi('POST', `/actions/runs/${run.id}/cancel`);
        const issueMatch = (run.display_title || '').match(/#(\d+)/);
        const issueNum = issueMatch ? issueMatch[1] : '';
        msg += `🛑 취소됨: ${run.name}${issueNum ? ' (Issue #' + issueNum + ')' : ''} [Run #${run.id}]\n`;
      } catch (e) {
        msg += `⚠️ 취소 실패: ${run.name} — ${e.message}\n`;
      }
    }
    msg += `\n총 ${items.length}개 작업 취소 요청 완료`;
    await tgSend(chatId, msg, { parse_mode: '' });
  } catch (e) {
    await tgSend(chatId, `❌ 취소 실패: ${e.message}`, { parse_mode: '' });
  }
};

COMMANDS['qa'] = COMMANDS['QA'] = async (chatId, arg) => {
  if (!GH_TOKEN) return tgSend(chatId, '⚠️ GITHUB\\_TOKEN 미설정');

  await tgSend(chatId, '🔍 QA 전체 점검을 시작합니다...\n\nClaude Code가 코드를 분석하고 결과를 리포트합니다.', { parse_mode: '' });

  try {
    try { await ghApi('POST', '/labels', { name: 'claude-fix', color: '7c3aed' }); } catch (e) {}
    let issue;
    try {
      issue = await ghApi('POST', '/issues', {
        title: `[QA] 전체 점검 · ${ts()}`,
        body: QA_BODY + `\n---\n> ${arg ? arg + ' · ' : ''}${chatId === CHAT_ID ? '텔레그램' : '카카오'} 봇에서 요청됨 · ${ts()}`,
        labels: ['claude-fix'],
      });
    } catch (labelErr) {
      issue = await ghApi('POST', '/issues', {
        title: `[QA] 전체 점검 · ${ts()}`,
        body: QA_BODY + `\n---\n> ${arg ? arg + ' · ' : ''}${chatId === CHAT_ID ? '텔레그램' : '카카오'} 봇에서 요청됨 · ${ts()}`,
      });
      try { await ghApi('POST', `/issues/${issue.number}/labels`, { labels: ['claude-fix'] }); } catch (e2) {}
    }

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
    /* 라벨 사전 생성 (없으면) */
    try { await ghApi('POST', '/labels', { name: 'claude-fix', color: '7c3aed' }); } catch (e) {}
    try { await ghApi('POST', '/labels', { name: 'design', color: '1d76db' }); } catch (e) {}

    let issue;
    try {
      issue = await ghApi('POST', '/issues', {
        title: `[디자인] ${arg.slice(0, 60)}`,
        body: `## 디자인 수정 요청\n\n${arg}\n\n### 규칙\n- CSS/UI만 수정할 것\n- 기능 로직 변경 금지\n- 모바일 반응형 유지\n\n---\n> 텔레그램 봇 · ${ts()}`,
        labels: ['claude-fix', 'design'],
      });
    } catch (labelErr) {
      issue = await ghApi('POST', '/issues', {
        title: `[디자인] ${arg.slice(0, 60)}`,
        body: `## 디자인 수정 요청\n\n${arg}\n\n### 규칙\n- CSS/UI만 수정할 것\n- 기능 로직 변경 금지\n- 모바일 반응형 유지\n\n---\n> 텔레그램 봇 · ${ts()}`,
      });
      try { await ghApi('POST', `/issues/${issue.number}/labels`, { labels: ['claude-fix', 'design'] }); } catch (e2) {}
    }
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
      const { data: allUsers } = await sb('GET', '/users?select=name,provider,plan,credits_song,credits_mv,credits_lyrics,login_count,last_login&order=last_login.desc&limit=20');
      if (allUsers?.length) {
        /* 각 유저의 이번 달 트랙 수 조회 */
        const monthStart = new Date();
        monthStart.setDate(1); monthStart.setHours(0,0,0,0);
        for (const u of allUsers.slice(0, 5)) {
          let songCount = 0;
          try {
            const { data: ut } = await sb('GET', `/tracks?owner_name=eq.${encodeURIComponent(u.name)}&owner_provider=eq.${encodeURIComponent(u.provider)}&created_at=gte.${monthStart.toISOString()}&select=id&limit=500`);
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
    } catch(e) { console.error('[Kakao notify]', e.message); }
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
    } catch(e) { console.error('[Kakao notify]', e.message); }
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
  } catch(e) { console.error('[Kakao notify]', e.message); }
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

/* ── 🚀 고도화 진행 현황 ── */
const UPGRADE_PHASES = {
  '2': { title: '안정화', pct: 100, items: ['셀렉터버그수정','WebKit스크롤바','레이스방지','대소문자무시','플랜동기화'] },
  '3': { title: '리텐션', pct: 100, items: ['출석체크+스트릭','복귀유저보너스','좋아요중복방지','소유자알림','인기차트Top5'] },
  '4': { title: '수익화', pct: 100, items: ['크레딧팩3종','V3.5vsV4.5비교','전환트리거','프리미엄미끼','프로필+팔로잉'] },
  '5': { title: '기술고도화', pct: 80, items: ['Realtime통합폴링','JWT인증','모듈분리(미완)'] },
  '6': { title: '플랫폼확장', pct: 100, items: ['AI DJ 4모드','앨범모드','상업라이선스','크레딧팩'] },
};

COMMANDS['고도화'] = COMMANDS['upgrade'] = COMMANDS['phase'] = async (chatId, arg) => {
  /* Phase 번호만 → 조회 */
  if (arg && UPGRADE_PHASES[arg]) {
    const phase = UPGRADE_PHASES[arg];
    let msg = `🚀 Phase ${arg}: ${phase.title} (${phase.pct}%)\n\n`;
    phase.items.forEach((item, i) => { msg += `${i+1}. ${item}\n`; });
    msg += `\n구현 요청: 고도화 진행 <지시사항>`;
    await tgSend(chatId, msg, { parse_mode: '' });
    try { await fetch(`${BASE}/api/kakao-notify`, { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${ADMIN_SECRET}`}, body:JSON.stringify({text:msg.slice(0,300)}) }); } catch(e) { console.error('[Kakao notify]', e.message); }
    return;
  }

  /* "고도화 진행 <지시>" → GitHub Issue 생성 (구현 트리거) */
  const isAction = arg && (arg.startsWith('진행') || arg.startsWith('구현') || arg.startsWith('추가') || arg.startsWith('개발') || arg.length > 10);
  if (isAction) {
    const instruction = arg.replace(/^(진행|구현|추가|개발)\s*/, '').trim() || arg;
    if (!GH_TOKEN) { await tgSend(chatId, '⚠️ GITHUB_TOKEN 미설정', { parse_mode: '' }); return; }
    await tgSend(chatId, `🚀 고도화 요청 처리 중...\n\n📝 "${instruction}"`, { parse_mode: '' });
    try {
      try { await ghApi('POST', '/labels', { name: 'claude-fix', color: '7c3aed' }); } catch (e) {}
      let issue;
      try {
        issue = await ghApi('POST', '/issues', {
          title: `[고도화] ${instruction.slice(0, 60)}`,
          body: `## 고도화 요청\n\n${instruction}\n\n---\n> 텔레그램 봇 고도화 명령 · ${ts()}`,
          labels: ['claude-fix'],
        });
      } catch (labelErr) {
        issue = await ghApi('POST', '/issues', {
          title: `[고도화] ${instruction.slice(0, 60)}`,
          body: `## 고도화 요청\n\n${instruction}\n\n---\n> 텔레그램 봇 고도화 명령 · ${ts()}`,
        });
        try { await ghApi('POST', `/issues/${issue.number}/labels`, { labels: ['claude-fix'] }); } catch (e2) {}
      }
      await tgSend(chatId, [
        `✅ 고도화 요청 등록!`,
        ``,
        `📋 Issue #${issue.number}`,
        `📝 ${instruction}`,
        ``,
        `🤖 Claude Code가 자동으로 구현하고 PR을 생성합니다.`,
        `완료되면 알림이 올 거예요.`,
        ``,
        `${issue.html_url}`,
      ].join('\n'), { parse_mode: '' });
    } catch (e) {
      await tgSend(chatId, `❌ 오류: ${e.message}`, { parse_mode: '' });
    }
    return;
  }

  /* 인자 없음 → 전체 현황 */
  const totalItems = Object.values(UPGRADE_PHASES).reduce((s,p) => s + p.items.length, 0);
  const avgPct = Math.round(Object.values(UPGRADE_PHASES).reduce((s,p) => s + p.pct, 0) / Object.keys(UPGRADE_PHASES).length);
  let msg = `🚀 고도화 진행 현황 (${avgPct}%)\n⏰ ${ts()}\n\n`;
  Object.entries(UPGRADE_PHASES).forEach(([k,v]) => {
    const bar = '█'.repeat(Math.round(v.pct/10)) + '░'.repeat(10-Math.round(v.pct/10));
    msg += `Phase ${k} ${v.title}: ${bar} ${v.pct}%\n`;
  });
  msg += `\n총 ${totalItems}개 항목`;
  msg += `\n\n📖 조회: 고도화 <번호>  (예: 고도화 3)`;
  msg += `\n🔧 구현: 고도화 진행 <지시>  (예: 고도화 진행 모듈 분리)`;
  await tgSend(chatId, msg, { parse_mode: '' });
  try { await fetch(`${BASE}/api/kakao-notify`, { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${ADMIN_SECRET}`}, body:JSON.stringify({text:msg.slice(0,300)}) }); } catch(e) { console.error('[Kakao notify]', e.message); }
};

/* ── 더미 데이터 관리 ── */
const DUMMY_IDOLS = [
  { name:'카리나', provider:'kakao', tracks:[
    {id:'dummy_karina_01',title:'Supernova',tags:'K-Pop, Dance, Synth, Energetic',likes:45,plays:312,style:'K-Pop, Dance, Synth, Space, Electronic, Powerful, Female Vocal',prompt:'[Verse 1]\n수백 개의 별빛 가운데\n나를 비추는 빛은 하나\n\n[Chorus]\nSupernova 터져버린 우주 속에\n너와 나의 gravity'},
    {id:'dummy_karina_02',title:'Next Level',tags:'K-Pop, Cyberpunk, Dance, Electronic',likes:38,plays:287,style:'K-Pop, Cyberpunk, Dance, Aggressive, Electronic, Glitch, Futuristic, Female Vocal',prompt:'[Verse 1]\n광야를 걸어가는 나\n멈출 수 없어 이 느낌\n\n[Chorus]\nNext level 더 높이 날아\n한계 넘어 새로운 세계로'},
  ]},
  { name:'윈터', provider:'kakao', tracks:[
    {id:'dummy_winter_01',title:'Whiplash',tags:'K-Pop, R&B, Smooth, Dreamy',likes:32,plays:198,style:'K-Pop, R&B, Smooth, Dreamy, Groovy, Female Vocal',prompt:'[Verse 1]\n차가운 바람 속에서\n너의 온기를 느껴\n\n[Chorus]\nWhiplash 마음을 흔들어\n멈출 수 없는 이 감정'},
    {id:'dummy_winter_02',title:'Drama',tags:'K-Pop, Pop, Theatrical, Powerful',likes:28,plays:175,style:'K-Pop, Pop, Theatrical, Powerful, Orchestral, Female Vocal',prompt:'[Verse 1]\n무대 위의 나는 달라\n조명 아래 빛나는 순간\n\n[Chorus]\nDrama 시작된 이야기\n끝날 때까지 멈추지 않을게'},
  ]},
  { name:'지수', provider:'google', tracks:[
    {id:'dummy_jisoo_01',title:'꽃 (FLOWER)',tags:'K-Pop, Elegant, Pop, Romantic',likes:52,plays:445,style:'K-Pop, Elegant, Pop, Romantic, Waltz, Strings, Female Vocal',prompt:'[Verse 1]\n바람에 흩날리는 꽃잎처럼\n너에게 다가가고 싶어\n\n[Chorus]\n꽃처럼 피어나는 사랑\n향기로운 이 순간을 기억해'},
    {id:'dummy_jisoo_02',title:'All Eyes On Me',tags:'K-Pop, Confident, Dance, Bold',likes:41,plays:320,style:'K-Pop, Confident, Dance, Pop, Bold, Female Vocal',prompt:'[Verse 1]\n시선을 모두 모아\n이 무대는 나의 것\n\n[Chorus]\nAll eyes on me\n빛나는 이 순간을 놓치지 마'},
  ]},
  { name:'제니', provider:'google', tracks:[
    {id:'dummy_jennie_01',title:'SOLO',tags:'K-Pop, Hip-Hop, Pop, Fierce',likes:58,plays:520,style:'K-Pop, Hip-Hop, Pop, Fierce, Confident, Trap, Female Vocal',prompt:'[Verse 1]\n혼자서도 빛나는 나\n누구에게도 기대지 않아\n\n[Chorus]\nI am going solo\n나는 나 혼자서도 충분해'},
    {id:'dummy_jennie_02',title:'Mantra',tags:'K-Pop, Dark Pop, Electronic, Edgy',likes:35,plays:278,style:'K-Pop, Dark Pop, Electronic, Edgy, Heavy Bass, Female Vocal',prompt:'[Verse 1]\n어둠 속에서 울리는 주문\n나를 깨우는 리듬\n\n[Chorus]\nMantra 반복되는 주문\n멈출 수 없는 이 비트 위에'},
  ]},
  { name:'민지', provider:'naver', tracks:[
    {id:'dummy_minji_01',title:'Hype Boy',tags:'K-Pop, Retro, Pop, Fresh',likes:61,plays:580,style:'K-Pop, Retro Pop, Fresh, Y2K, Groovy, Female Vocal',prompt:'[Verse 1]\n너를 처음 본 그날부터\n하루도 빠짐없이 생각해\n\n[Chorus]\n1 to 10 내 맘을 다 줄게\nHype boy 너만 바라봐'},
    {id:'dummy_minji_02',title:'Super Shy',tags:'K-Pop, Dance Pop, Cute, Bright',likes:55,plays:490,style:'K-Pop, Dance Pop, Cute, Synth, Bright, Female Vocal',prompt:'[Verse 1]\n너 앞에만 서면 작아지는 나\n말하고 싶은데 용기가 안 나\n\n[Chorus]\nSuper shy super shy\n네 앞에선 아무 말도 못 해'},
  ]},
  { name:'하니', provider:'naver', tracks:[
    {id:'dummy_hanni_01',title:'Ditto',tags:'K-Pop, Nostalgic, Lo-Fi Pop, Dreamy',likes:49,plays:410,style:'K-Pop, Nostalgic, Lo-Fi Pop, Dreamy, Soft, Female Vocal',prompt:'[Verse 1]\n나도 같은 마음이야\n말하지 않아도 알잖아\n\n[Chorus]\nDitto 너와 나 같은 마음\n하나가 되는 이 순간'},
    {id:'dummy_hanni_02',title:'OMG',tags:'K-Pop, Pop, Playful, Catchy',likes:43,plays:355,style:'K-Pop, Pop, Playful, Catchy, Upbeat, Female Vocal',prompt:'[Verse 1]\n오늘도 네 생각에\n하루가 다 지나가\n\n[Chorus]\nOh my god 이게 사랑인가 봐\n멈출 수가 없어'},
  ]},
  { name:'장원영', provider:'kakao', tracks:[
    {id:'dummy_wonyoung_01',title:'LOVE DIVE',tags:'K-Pop, Elegant, Pop, Glamorous',likes:64,plays:620,style:'K-Pop, Elegant, Pop, Glamorous, Dance, Female Vocal',prompt:'[Verse 1]\n깊은 바다 속으로\n빠져드는 이 감정\n\n[Chorus]\nLove dive 네 안에 빠져들어\n이 사랑의 깊이를 느껴봐'},
    {id:'dummy_wonyoung_02',title:'Kitsch',tags:'K-Pop, Retro, Funky, Colorful',likes:47,plays:380,style:'K-Pop, Retro, Funky, Colorful, Pop, Female Vocal',prompt:'[Verse 1]\n키치한 나의 세계로\n초대할게 들어와\n\n[Chorus]\nKitsch 반짝이는 나의 우주\n평범함은 거부해'},
  ]},
  { name:'안유진', provider:'kakao', tracks:[
    {id:'dummy_yujin_01',title:'Off The Record',tags:'K-Pop, Pop, Bright, Fresh',likes:36,plays:265,style:'K-Pop, Pop, Bright, Fresh, Acoustic, Female Vocal',prompt:'[Verse 1]\n카메라가 꺼진 뒤에\n진짜 내 모습을 보여줄게\n\n[Chorus]\nOff the record 솔직한 나\n꾸미지 않은 이 순간이 좋아'},
    {id:'dummy_yujin_02',title:'해야 (HEYA)',tags:'K-Pop, Traditional, Dance, Powerful',likes:42,plays:340,style:'K-Pop, Traditional Fusion, Dance, Powerful, Female Vocal',prompt:'[Verse 1]\n해야 해야 떠올라라\n어둠을 밝혀줘\n\n[Chorus]\n해야 해야 비춰줘\n세상을 환하게 물들여줘'},
  ]},
  { name:'아이유', provider:'google', tracks:[
    {id:'dummy_iu_01',title:'Blueming',tags:'K-Pop, Indie Pop, Bright, Romantic',likes:72,plays:780,style:'K-Pop, Indie Pop, Bright, Romantic, Acoustic Guitar, Female Vocal',prompt:'[Verse 1]\n보랏빛 하늘 아래서\n너를 만난 그 순간\n\n[Chorus]\n블루밍 피어나는 우리 사랑\n이 계절이 영원하길'},
    {id:'dummy_iu_02',title:'좋은 날',tags:'K-Pop, Ballad, Emotional, Piano',likes:68,plays:720,style:'K-Pop, Pop Ballad, Emotional, Piano, High Note, Female Vocal',prompt:'[Verse 1]\n울고 싶지 않은데\n눈물이 자꾸 흘러\n\n[Chorus]\n좋은 날이 올 거야\n그날까지 조금만 기다려줘'},
    {id:'dummy_iu_03',title:'Celebrity',tags:'K-Pop, Pop, Uplifting, Catchy',likes:56,plays:530,style:'K-Pop, Dance Pop, Uplifting, Catchy, Synth, Female Vocal',prompt:'[Verse 1]\n넌 이미 빛나고 있어\n아무도 모르게\n\n[Chorus]\nYou are my celebrity\n세상에서 가장 빛나는 사람'},
  ]},
  { name:'태연', provider:'google', tracks:[
    {id:'dummy_taeyeon_01',title:'INVU',tags:'K-Pop, Dark Pop, Elegant, Synth',likes:50,plays:430,style:'K-Pop, Dark Pop, Elegant, Synth, Dance, Female Vocal',prompt:'[Verse 1]\n너를 향한 질투\n감출 수 없는 감정\n\n[Chorus]\nI-N-V-U\n이 마음을 어떡해'},
    {id:'dummy_taeyeon_02',title:'Rain',tags:'K-Pop, Ballad, Emotional, Piano',likes:44,plays:365,style:'K-Pop, Ballad, Emotional, Piano, Melancholy, Female Vocal',prompt:'[Verse 1]\n비가 내리는 밤\n너의 목소리가 들려\n\n[Chorus]\n비처럼 쏟아지는 그리움\n멈출 수가 없어'},
    {id:'dummy_taeyeon_03',title:'Weekend',tags:'K-Pop, Bossa Nova, Chill, Happy',likes:39,plays:298,style:'K-Pop, Bossa Nova, Chill, Happy, Acoustic, Female Vocal',prompt:'[Verse 1]\n월요일부터 금요일까지\n기다렸던 이 순간\n\n[Chorus]\n주말이야 함께 놀자\n아무 걱정 없이 즐겨봐'},
  ]},
  { name:'화사', provider:'kakao', tracks:[
    {id:'dummy_hwasa_01',title:'Maria',tags:'K-Pop, Latin Pop, Bold, Powerful',likes:53,plays:460,style:'K-Pop, Latin Pop, Bold, Brass, Powerful Female Vocal, Dramatic',prompt:'[Verse 1]\n거울 속에 비친 나를 봐\n상처투성이지만 아름다워\n\n[Chorus]\nMaria 나를 위한 노래\n세상이 등을 돌려도\n나는 멈추지 않아'},
    {id:'dummy_hwasa_02',title:'I Love My Body',tags:'K-Pop, R&B, Funk, Groovy',likes:47,plays:390,style:'K-Pop, R&B, Funk, Groovy, Confident, Female Vocal',prompt:'[Verse 1]\n오늘도 거울 앞에 서서\n나를 바라봐 있는 그대로\n\n[Chorus]\nI love my body\n있는 그대로의 나\n흔들리지 않을래'},
  ]},
];

/* Supabase 직접 fetch (Prefer 커스텀 가능) */
async function sbRaw(method, path, body = null, prefer = null) {
  if (!SB_URL || !SB_KEY) throw new Error('Supabase 미설정');
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json; charset=utf-8' };
  if (prefer) headers.Prefer = prefer;
  else if (method === 'POST') headers.Prefer = 'return=minimal';
  else if (method === 'DELETE' || method === 'PATCH') headers.Prefer = 'return=minimal';
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1${path}`, opts);
  if (!r.ok) { const t = await r.text(); throw new Error(`SB ${r.status}: ${t.slice(0,100)}`); }
  const txt = await r.text();
  return txt ? JSON.parse(txt) : [];
}

COMMANDS['더미'] = COMMANDS['dummy'] = async (chatId) => {
  let msg = '🧪 아이돌 더미 데이터 현황\n\n';
  try {
    const tracks = await sbRaw('GET', '/tracks?id=like.dummy_*&select=id,title,owner_name,comm_likes,audio_url&order=comm_likes.desc');
    const withAudio = tracks.filter(t => t.audio_url && t.audio_url.startsWith('http'));

    msg += `트랙: ${tracks.length}곡 (음악 생성완료: ${withAudio.length}곡)\n\n`;

    const grouped = {};
    tracks.forEach(t => { if (!grouped[t.owner_name]) grouped[t.owner_name] = []; grouped[t.owner_name].push(t); });
    Object.entries(grouped).sort((a,b) => b[1].length - a[1].length).forEach(([name, list]) => {
      msg += `${name}: ${list.map(t=>(t.audio_url?.startsWith('http')?'🎵':'⬜')+t.title).join(', ')}\n`;
    });

    DUMMY_IDOLS.forEach(idol => {
      if (!grouped[idol.name]) msg += `${idol.name}: (미등록)\n`;
    });
  } catch (e) { msg += '조회 실패: ' + e.message; }
  await tgSend(chatId, msg, { parse_mode: '' });
};

COMMANDS['더미추가'] = COMMANDS['seed'] = async (chatId) => {
  await tgSend(chatId, '🧪 아이돌 더미 데이터 삽입 시작...', { parse_mode: '' });
  try {
    // 1. 트랙 삽입
    const trackData = [];
    DUMMY_IDOLS.forEach(idol => {
      idol.tracks.forEach(t => {
        trackData.push({
          id: t.id, title: t.title, tags: t.tags, lyrics: t.prompt,
          gen_mode: 'custom', owner_name: idol.name, owner_avatar: '',
          owner_provider: idol.provider, is_public: true,
          comm_likes: t.likes, comm_plays: t.plays,
          created: Date.now() - 86400000 * 2
        });
      });
    });
    await sbRaw('POST', '/tracks', trackData, 'resolution=ignore-duplicates,return=minimal');
    const trackCount = trackData.length;

    // 2. 팔로우 삽입
    const creators = [{name:'Kenny LEE',provider:'google'},{name:'김재현',provider:'google'},{name:'Kenny',provider:'google'}];
    const follows = [];
    // 아이돌 → 크리에이터
    DUMMY_IDOLS.forEach(idol => {
      creators.forEach(cr => {
        follows.push({ follower_name:idol.name, follower_provider:idol.provider, following_name:cr.name, following_provider:cr.provider });
      });
    });
    // 아이돌 상호 팔로우 (일부)
    const pairs = [[0,1],[0,4],[1,2],[2,3],[3,6],[4,5],[5,7],[6,7],[7,8],[8,9],[9,0],[1,8],[3,9],[5,6],[2,7],[10,0],[10,2],[10,8]];
    pairs.forEach(([a,b]) => {
      if (DUMMY_IDOLS[a] && DUMMY_IDOLS[b]) {
        follows.push({ follower_name:DUMMY_IDOLS[a].name, follower_provider:DUMMY_IDOLS[a].provider, following_name:DUMMY_IDOLS[b].name, following_provider:DUMMY_IDOLS[b].provider });
      }
    });
    // 크리에이터 → 아이돌 일부
    [0,2,4,6,8,10].forEach(i => {
      if (DUMMY_IDOLS[i]) follows.push({ follower_name:creators[0].name, follower_provider:creators[0].provider, following_name:DUMMY_IDOLS[i].name, following_provider:DUMMY_IDOLS[i].provider });
    });
    await sbRaw('POST', '/follows', follows, 'resolution=ignore-duplicates,return=minimal');

    const msg = `✅ 더미 데이터 삽입 완료!\n\n🎵 트랙: ${trackCount}곡 (${DUMMY_IDOLS.length}명)\n👥 팔로우: ${follows.length}건\n\n아이돌: ${DUMMY_IDOLS.map(i=>i.name).join(', ')}\n\n⚠️ 오디오 없는 트랙은 커뮤니티에서 재생 불가\n실제 음악 생성은 CLI에서 seed 스크립트 실행 필요`;
    await tgSend(chatId, msg, { parse_mode: '' });
  } catch (e) {
    await tgSend(chatId, '❌ 삽입 실패: ' + e.message, { parse_mode: '' });
  }
};

COMMANDS['더미삭제'] = COMMANDS['unseed'] = async (chatId) => {
  await tgSend(chatId, '🗑 아이돌 더미 데이터 삭제 중...', { parse_mode: '' });
  try {
    // 트랙 삭제
    await sbRaw('DELETE', '/tracks?id=like.dummy_*');
    // 팔로우 삭제 (아이돌 이름 기준)
    const names = DUMMY_IDOLS.map(i => i.name);
    for (const name of names) {
      await sbRaw('DELETE', `/follows?or=(follower_name.eq.${encodeURIComponent(name)},following_name.eq.${encodeURIComponent(name)})`);
    }
    await tgSend(chatId, `✅ 더미 데이터 삭제 완료!\n\n삭제 대상: ${names.join(', ')}\n트랙 (dummy_*) + 팔로우 전부 제거됨`, { parse_mode: '' });
  } catch (e) {
    await tgSend(chatId, '❌ 삭제 실패: ' + e.message, { parse_mode: '' });
  }
};

COMMANDS['채팅공지'] = COMMANDS['chatnotice'] = async (chatId, arg) => {
  if (!arg) { await tgSend(chatId, '사용법: 채팅공지 <메시지>', { parse_mode: '' }); return; }
  try {
    const msg = {
      room: 'general',
      content: '📢 ' + arg,
      author_name: '관리자',
      author_avatar: '',
      author_provider: 'admin',
    };
    await sbRaw('POST', '/chat_messages', msg);
    await tgSend(chatId, '✅ 채팅 공지 전송 완료!\n\n📢 ' + arg + '\n\n⏰ ' + ts(), { parse_mode: '' });
  } catch (e) {
    await tgSend(chatId, '❌ 전송 실패: ' + e.message, { parse_mode: '' });
  }
};

COMMANDS['채팅초기화'] = COMMANDS['clearchat'] = async (chatId) => {
  await tgSend(chatId, '🗑 커뮤니티 채팅 초기화 중...', { parse_mode: '' });
  try {
    await sbRaw('DELETE', '/chat_messages?room=eq.general');
    await tgSend(chatId, '✅ 커뮤니티 채팅 초기화 완료!\n\nchat_messages 테이블 전체 삭제됨\n⏰ ' + ts(), { parse_mode: '' });
  } catch (e) {
    await tgSend(chatId, '❌ 초기화 실패: ' + e.message, { parse_mode: '' });
  }
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
    } catch(e) { console.error('[Kakao notify]', e.message); }

  } catch (e) {
    await tgSend(chatId, `❌ API 문서 로드 실패: ${e.message}\n\n직접 확인: KIE_API_REFERENCE.md`, { parse_mode: '' });
  }
};

/* ── /생성 — 텔레그램에서 직접 음악 생성 ── */
COMMANDS['생성'] = COMMANDS['generate'] = COMMANDS['만들어'] = async (chatId, arg) => {
  if (!arg) {
    await tgSend(chatId, [
      '🎵 음악 생성 명령어',
      '',
      '━━ 사용법 ━━',
      '생성 <가사 또는 설명>',
      '생성 -t 제목 -s 스타일 -v m 가사내용',
      '',
      '━━ 옵션 ━━',
      '-t <제목>  곡 제목 (기본: AI 자동)',
      '-s <스타일>  장르/분위기 (예: k-pop, ballad)',
      '-v <m|f>  보컬 성별 (m=남, f=여)',
      '-i  인스트루멘탈 (보컬 없음)',
      '-m <모델>  V4_5(기본), V5',
      '',
      '━━ 예시 ━━',
      '생성 봄날의 따뜻한 고백 노래',
      '생성 -t 봄바람 -s k-pop, ballad -v f 벚꽃이 흩날리는 봄날에',
      '생성 -i -s lo-fi, chill 비오는 날 카페',
    ].join('\n'), { parse_mode: '' });
    return;
  }

  /* 옵션 파싱 */
  let title = '', style = '', vocalGender = '', instrumental = false, model = 'V4_5', prompt = arg;
  const tMatch = arg.match(/-t\s+([^-]+)/);
  if (tMatch) { title = tMatch[1].trim(); prompt = prompt.replace(tMatch[0], ''); }
  const sMatch = arg.match(/-s\s+([^-]+)/);
  if (sMatch) { style = sMatch[1].trim(); prompt = prompt.replace(sMatch[0], ''); }
  const vMatch = arg.match(/-v\s+(m|f)/i);
  if (vMatch) { vocalGender = vMatch[1].toLowerCase(); prompt = prompt.replace(vMatch[0], ''); }
  if (/-i\b/.test(prompt)) { instrumental = true; prompt = prompt.replace(/-i\b/, ''); }
  const mMatch = arg.match(/-m\s+(\S+)/i);
  if (mMatch) { model = mMatch[1].toUpperCase(); prompt = prompt.replace(mMatch[0], ''); }
  prompt = prompt.trim();

  if (!prompt && !title) {
    await tgSend(chatId, '❌ 가사 또는 설명을 입력해주세요.\n\n예: 생성 봄날의 따뜻한 고백 노래', { parse_mode: '' });
    return;
  }

  if (!KIE_KEY) {
    await tgSend(chatId, '❌ KIE_API_KEY가 설정되지 않았습니다.', { parse_mode: '' });
    return;
  }

  /* 진행 알림 */
  await tgSend(chatId, [
    '🎵 음악 생성 시작!',
    '',
    '📝 프롬프트: ' + (prompt || '(없음)').slice(0, 100),
    title ? '🏷 제목: ' + title : '',
    style ? '🎸 스타일: ' + style : '',
    vocalGender ? '🎤 보컬: ' + (vocalGender === 'm' ? '남성' : '여성') : '',
    instrumental ? '🎹 인스트루멘탈' : '',
    '🤖 모델: ' + model,
    '',
    '⏳ 생성 중... (1~3분 소요)',
  ].filter(Boolean).join('\n'), { parse_mode: '' });

  try {
    /* 1. kie.ai 음악 생성 요청 */
    const genPayload = {
      prompt: prompt || title || 'Untitled',
      customMode: !!(style || vocalGender),
      instrumental,
      model,
      callBackUrl: `${BASE}/api/callback`,
    };
    if (title) genPayload.title = title;
    if (style) genPayload.style = style;
    if (vocalGender) genPayload.vocalGender = vocalGender;

    const genBuf = Buffer.from(JSON.stringify(genPayload), 'utf-8');
    const genRes = await fetch('https://api.kie.ai/api/v1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KIE_KEY}`,
      },
      body: genBuf,
    });
    const genData = await genRes.json();
    if (genData.code !== 200 || !genData.data?.taskId) {
      throw new Error(genData.msg || 'API 응답 오류: ' + JSON.stringify(genData).slice(0, 200));
    }
    const taskId = genData.data.taskId;

    /* 2. 폴링 (최대 45초 — Vercel 서버리스 60초 타임아웃 안전 마진) */
    let tracks = null;
    const pollStart = Date.now();
    const POLL_LIMIT_MS = 45000;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      if (Date.now() - pollStart > POLL_LIMIT_MS) break;
      const pollRes = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${taskId}`, {
        headers: { Authorization: `Bearer ${KIE_KEY}` },
      });
      const poll = await pollRes.json();
      const status = poll.data?.status || poll.data?.state || '';

      if (status === 'SUCCESS' || status === 'FIRST_SUCCESS') {
        tracks = poll.data?.response?.sunoData || poll.data?.sunoData || poll.data?.tracks || [];
        if (tracks.length > 0) break;
      }
      if (status === 'FAILED' || status === 'GENERATE_AUDIO_FAILED') {
        throw new Error('생성 실패: ' + status);
      }
      if (status === 'SENSITIVE_WORD_ERROR') {
        throw new Error('부적절한 단어가 포함되어 생성이 차단되었습니다.');
      }
    }

    if (!tracks || tracks.length === 0) {
      /* 시간 내 미완료 → 백그라운드 폴링 예약 (callback 기반) */
      await tgSend(chatId, '⏳ 생성 진행 중 (taskId: ' + taskId.slice(0, 12) + ')\n\n아직 완료되지 않았어요. 완료되면 자동으로 알림이 갑니다.\n\n수동 확인: 트랙 명령으로 확인하세요.', { parse_mode: '' });
      /* Supabase에 대기 중인 작업 저장 */
      try {
        await sb('POST', '/tracks', {
          id: 'pending-' + taskId.slice(0, 12),
          task_id: taskId,
          title: title || '생성 중...',
          audio_url: '',
          tags: style || 'bot-generating',
          lyrics: prompt || '',
          gen_mode: 'bot-pending',
          is_public: false,
          owner_name: 'Kenny Bot',
          owner_avatar: '🤖',
          owner_provider: 'bot',
        });
      } catch(e) {}
      return;
    }

    /* 3. Supabase에 트랙 저장 (커뮤니티 즉시 노출) */
    const saved = [];
    for (const t of tracks) {
      const trackData = {
        id: t.id || t.audioId || `bot-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        task_id: taskId,
        title: t.title || title || '봇 생성곡',
        audio_url: t.audioUrl || t.audio_url || t.song_path || '',
        image_url: t.imageUrl || t.image_url || '',
        tags: style || t.tags || 'bot-generated',
        lyrics: prompt || '',
        gen_mode: 'bot',
        is_public: true,
        owner_name: 'Kenny Bot',
        owner_avatar: '🤖',
        owner_provider: 'bot',
        comm_likes: 0,
        comm_dislikes: 0,
        comm_plays: 0,
      };
      try {
        await sb('POST', '/tracks', trackData);
        saved.push(trackData);
      } catch (e) {
        console.warn('[bot-gen] save error:', e.message);
      }
    }

    /* 4. 결과 알림 */
    const resultLines = [
      '✅ 음악 생성 완료!',
      '',
    ];
    saved.forEach((t, i) => {
      resultLines.push(`🎶 ${i + 1}. ${t.title}`);
      if (t.audio_url) resultLines.push(`🔗 ${t.audio_url}`);
    });
    resultLines.push('');
    resultLines.push('🌐 커뮤니티에 즉시 공개됨');
    resultLines.push(`🔗 ${BASE}`);

    await tgSend(chatId, resultLines.join('\n'), { parse_mode: '' });

    /* 카카오에도 전송 */
    try {
      await fetch(`${BASE}/api/kakao-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: resultLines.slice(0, 5).join('\n').slice(0, 300) }),
      });
    } catch(e) {}

  } catch (e) {
    await tgSend(chatId, '❌ 음악 생성 실패\n\n' + e.message, { parse_mode: '' });
  }
};

/* 커스텀 = 생성 (가사 기반) */
COMMANDS['커스텀'] = COMMANDS['custom'] = async (chatId, arg) => {
  if (!arg) {
    await tgSend(chatId, [
      '🎵 커스텀 생성',
      '',
      '가사를 직접 입력해서 음악을 만듭니다.',
      '',
      '사용법: 커스텀 <가사>',
      '스타일 추가: 커스텀 -s K-Pop, 발라드 가사내용',
      '',
      '예시:',
      '커스텀 [Verse 1] 너를 만난 그날부터',
      '커스텀 -s lo-fi, chill 새벽 감성 가사',
    ].join('\n'), { parse_mode: '' });
    return;
  }
  await COMMANDS['생성'](chatId, arg);
};

/* 심플 = 설명만으로 생성 */
COMMANDS['심플'] = COMMANDS['simple'] = async (chatId, arg) => {
  if (!arg) {
    await tgSend(chatId, [
      '✨ 심플 생성',
      '',
      '설명만 입력하면 AI가 알아서 만듭니다.',
      '',
      '사용법: 심플 <곡 설명>',
      '',
      '예시:',
      '심플 비 오는 날 듣기 좋은 재즈',
      '심플 신나는 EDM 파티 음악',
      '심플 잔잔한 어쿠스틱 기타',
    ].join('\n'), { parse_mode: '' });
    return;
  }
  /* 심플은 설명을 스타일로도 사용 */
  await COMMANDS['생성'](chatId, `-s ${arg} ${arg}`);
};

/* 유튜브 = 스타일 기반 생성 */
COMMANDS['유튜브'] = COMMANDS['youtube'] = COMMANDS['yt'] = async (chatId, arg) => {
  if (!arg) {
    await tgSend(chatId, [
      '🎬 유튜브 스타일 생성',
      '',
      '원하는 스타일을 설명하면 음악을 만듭니다.',
      '',
      '사용법: 유튜브 <스타일 설명>',
      '',
      '예시:',
      '유튜브 lo-fi hip hop chill beats',
      '유튜브 cinematic epic orchestral',
      '유튜브 K-Pop 걸그룹 댄스',
    ].join('\n'), { parse_mode: '' });
    return;
  }
  await COMMANDS['생성'](chatId, `-s ${arg} ${arg}`);
};

/* MV 생성 */
COMMANDS['mv'] = COMMANDS['MV'] = COMMANDS['뮤비'] = async (chatId, arg) => {
  if (!arg) {
    await tgSend(chatId, [
      '🎬 MV 생성',
      '',
      '기존 트랙에 뮤직비디오를 생성합니다.',
      '',
      '사용법: MV <트랙ID>',
      '',
      '"트랙" 명령으로 최근 곡 목록을 확인하세요.',
    ].join('\n'), { parse_mode: '' });
    return;
  }

  if (!KIE_KEY) {
    await tgSend(chatId, '❌ KIE_API_KEY 미설정', { parse_mode: '' });
    return;
  }

  /* 트랙 조회 */
  let track;
  try {
    const { data } = await sb('GET', `/tracks?id=eq.${arg}&select=id,title,audio_url,image_url,lyrics&limit=1`);
    track = data?.[0];
  } catch {}
  if (!track) {
    await tgSend(chatId, `❌ 트랙 ID "${arg}"를 찾을 수 없습니다.\n\n"트랙" 명령으로 최근 곡 목록을 확인하세요.`, { parse_mode: '' });
    return;
  }

  await tgSend(chatId, `🎬 MV 생성 시작!\n\n🎧 ${track.title}\n\n⏳ 3~5분 소요`, { parse_mode: '' });

  try {
    const mvPayload = {
      audioUrl: track.audio_url,
      title: track.title || '무제',
      lyrics: track.lyrics || '',
      imageUrl: track.image_url || '',
      callBackUrl: `${BASE}/api/callback`,
    };
    const mvBuf = Buffer.from(JSON.stringify(mvPayload), 'utf-8');
    const mvRes = await fetch('https://api.kie.ai/api/v1/generate/mv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KIE_KEY}` },
      body: mvBuf,
    });
    const mvData = await mvRes.json();
    const taskId = mvData?.data?.taskId || mvData?.taskId;
    if (!taskId) throw new Error('MV taskId 없음');

    /* 폴링 (최대 7분) */
    let videoUrl = '';
    for (let i = 0; i < 90; i++) {
      await new Promise(r => setTimeout(r, i < 5 ? 3000 : 5000));
      const pollRes = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${taskId}`, {
        headers: { Authorization: `Bearer ${KIE_KEY}` },
      });
      const poll = await pollRes.json();
      const status = (poll.data?.status || '').toUpperCase();
      if (status === 'SUCCESS' || status === 'FIRST_SUCCESS') {
        const tracks = poll.data?.response?.sunoData || poll.data?.sunoData || poll.data?.tracks || [];
        videoUrl = tracks[0]?.videoUrl || tracks[0]?.video_url || '';
        if (videoUrl) break;
      }
      if (['FAILED', 'ERROR', 'TIMEOUT'].includes(status)) {
        throw new Error('MV 생성 실패: ' + status);
      }
    }
    if (!videoUrl) throw new Error('MV 생성 타임아웃');

    /* DB 업데이트 */
    try { await sb('PATCH', `/tracks?id=eq.${arg}`, { video_url: videoUrl }); } catch {}

    await tgSend(chatId, [
      '✅ MV 생성 완료!',
      '',
      `🎧 ${track.title}`,
      `🔗 ${videoUrl}`,
      '',
      `🌐 ${BASE}`,
    ].join('\n'), { parse_mode: '' });

    /* 카카오에도 전송 */
    try {
      await fetch(`${BASE}/api/kakao-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `🎬 MV 생성 완료!\n\n🎧 ${track.title}\n🔗 ${BASE}` }),
      });
    } catch {}

  } catch (e) {
    await tgSend(chatId, '❌ MV 생성 실패\n\n' + e.message, { parse_mode: '' });
  }
};

/* ── /mc — 프로젝트 MD 파일 조회 ── */
COMMANDS['mc'] = COMMANDS['md'] = COMMANDS['문서'] = async (chatId, arg) => {
  const KNOWN_FILES = {
    'claude': 'CLAUDE.md',
    'readme': 'README.md',
    'api': 'KIE_API_REFERENCE.md',
    'kie': 'KIE_API_REFERENCE.md',
    'changelog': 'docs/changelog-20260322.md',
    'roadmap': 'docs/ROADMAP.md',
    'plan': 'docs/WORK_PLAN.md',
    'policy': 'docs/POLICY.md',
    'bot': 'docs/TELEGRAM_BOT.md',
    'telegram': 'docs/TELEGRAM_BOT.md',
    'cicd': 'docs/CI_CD_PIPELINE.md',
    'flutter': 'docs/FLUTTER_APP.md',
    'architecture': 'docs/API_ARCHITECTURE.md',
    'sequence': 'docs/SEQUENCE_DIAGRAM.md',
    'tab': 'docs/tab-structure.md',
    'zindex': 'docs/z-index-layers.md',
    'community': 'docs/community-layout.md',
    'storyboard': 'docs/STORYBOARD.md',
  };

  if (!arg) {
    const list = Object.entries(KNOWN_FILES).map(([k, v]) => `${k} → ${v}`).join('\n');
    await tgSend(chatId, `📄 프로젝트 문서 조회\n\n사용법: mc <파일명>\n\n━━ 사용 가능한 파일 ━━\n${list}\n\n예: mc claude\n예: mc bot\n예: mc docs/ROADMAP.md`, { parse_mode: '' });
    return;
  }

  /* 파일 경로 결정 */
  const key = arg.toLowerCase().replace(/\.md$/i, '').replace(/\//g, '');
  let filePath = KNOWN_FILES[key] || arg;
  if (!filePath.endsWith('.md')) filePath += '.md';

  try {
    const _ghHeaders = GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github.raw' } : {};
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${encodeURIComponent(filePath)}?ref=main`, { headers: _ghHeaders });
    if (!r.ok) throw new Error(`파일 없음: ${filePath} (${r.status})`);
    let content = await r.text();

    /* 텔레그램 4096자 제한 */
    if (content.length > 4000) content = content.slice(0, 4000) + '\n\n... (이하 생략)';

    await tgSend(chatId, `📄 ${filePath}\n${'━'.repeat(30)}\n\n${content}`, { parse_mode: '' });
  } catch (e) {
    await tgSend(chatId, `❌ 파일 조회 실패: ${e.message}`, { parse_mode: '' });
  }
};

/* ── Git 관리 명령어 ── */

/* /브랜치 — 원격 브랜치 목록 */
COMMANDS['브랜치'] = COMMANDS['branch'] = COMMANDS['branches'] = async (chatId, arg) => {
  try {
    const branches = await ghApi('GET', '/branches?per_page=30');
    if (!branches.length) { await tgSend(chatId, '브랜치 없음', { parse_mode: '' }); return; }
    const lines = ['🔀 원격 브랜치 (' + branches.length + '개)', ''];
    branches.forEach(b => {
      const isMain = b.name === 'main' ? ' ⭐' : '';
      lines.push((b.protected ? '🔒 ' : '  ') + b.name + isMain);
    });
    await tgSend(chatId, lines.join('\n'), { parse_mode: '' });
  } catch (e) { await tgSend(chatId, '❌ ' + e.message, { parse_mode: '' }); }
};

/* /브랜치삭제 <이름> */
COMMANDS['브랜치삭제'] = COMMANDS['delbranch'] = async (chatId, arg) => {
  if (!arg) { await tgSend(chatId, '사용법: 브랜치삭제 <브랜치이름>', { parse_mode: '' }); return; }
  if (arg === 'main' || arg === 'master') { await tgSend(chatId, '⛔ main/master 브랜치는 삭제할 수 없습니다.', { parse_mode: '' }); return; }
  try {
    await ghApi('DELETE', '/git/refs/heads/' + arg);
    await tgSend(chatId, '✅ 브랜치 삭제 완료: ' + arg, { parse_mode: '' });
  } catch (e) { await tgSend(chatId, '❌ ' + e.message, { parse_mode: '' }); }
};

/* /이슈 — 이슈 목록 */
COMMANDS['이슈'] = COMMANDS['issues'] = COMMANDS['issue'] = async (chatId, arg) => {
  try {
    const state = (arg === 'closed' || arg === '닫힌') ? 'closed' : 'open';
    const issues = await ghApi('GET', '/issues?state=' + state + '&per_page=15&sort=updated&direction=desc');
    /* PR 제외 */
    const real = issues.filter(i => !i.pull_request);
    if (!real.length) { await tgSend(chatId, '📋 ' + state + ' 이슈 없음', { parse_mode: '' }); return; }
    const lines = ['📋 이슈 (' + state + ', ' + real.length + '개)', ''];
    real.forEach(i => {
      const labels = i.labels.map(l => l.name).join(',');
      lines.push('#' + i.number + ' ' + i.title + (labels ? ' [' + labels + ']' : ''));
    });
    await tgSend(chatId, lines.join('\n'), { parse_mode: '' });
  } catch (e) { await tgSend(chatId, '❌ ' + e.message, { parse_mode: '' }); }
};

/* /이슈닫기 <번호> */
COMMANDS['이슈닫기'] = COMMANDS['closeissue'] = async (chatId, arg) => {
  if (!arg) { await tgSend(chatId, '사용법: 이슈닫기 <번호>', { parse_mode: '' }); return; }
  try {
    const d = await ghApi('PATCH', '/issues/' + arg.replace('#', ''), { state: 'closed', state_reason: 'completed' });
    await tgSend(chatId, '✅ 이슈 #' + d.number + ' 닫기 완료: ' + d.title, { parse_mode: '' });
  } catch (e) { await tgSend(chatId, '❌ ' + e.message, { parse_mode: '' }); }
};

/* /PR닫기 <번호> — PR 닫기 + 브랜치 삭제 */
COMMANDS['PR닫기'] = COMMANDS['pr닫기'] = COMMANDS['closepr'] = async (chatId, arg) => {
  if (!arg) { await tgSend(chatId, '사용법: PR닫기 <번호>', { parse_mode: '' }); return; }
  try {
    const pr = await ghApi('PATCH', '/pulls/' + arg.replace('#', ''), { state: 'closed' });
    let msg = '✅ PR #' + pr.number + ' 닫기 완료: ' + pr.title;
    /* 브랜치 삭제 */
    const branch = pr.head?.ref;
    if (branch && branch !== 'main') {
      try {
        await ghApi('DELETE', '/git/refs/heads/' + branch);
        msg += '\n🗑 브랜치 삭제: ' + branch;
      } catch(e) { msg += '\n⚠ 브랜치 삭제 실패: ' + e.message; }
    }
    await tgSend(chatId, msg, { parse_mode: '' });
  } catch (e) { await tgSend(chatId, '❌ ' + e.message, { parse_mode: '' }); }
};

/* /커밋 — 최근 커밋 목록 */
COMMANDS['커밋'] = COMMANDS['commits'] = COMMANDS['log'] = async (chatId, arg) => {
  try {
    const n = Math.min(parseInt(arg) || 10, 20);
    const commits = await ghApi('GET', '/commits?per_page=' + n);
    if (!commits.length) { await tgSend(chatId, '커밋 없음', { parse_mode: '' }); return; }
    const lines = ['📝 최근 커밋 (' + commits.length + '개)', ''];
    commits.forEach(c => {
      const sha = c.sha.slice(0, 7);
      const msg = (c.commit.message || '').split('\n')[0].slice(0, 60);
      const author = c.commit.author?.name || '?';
      const date = new Date(c.commit.author?.date).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      lines.push(sha + ' ' + msg + ' (' + author + ', ' + date + ')');
    });
    await tgSend(chatId, lines.join('\n'), { parse_mode: '' });
  } catch (e) { await tgSend(chatId, '❌ ' + e.message, { parse_mode: '' }); }
};

/* ── 테스트 케이스 조회 (/tc) ── */
const TC_DATA = {
  음악: {
    label: '🎵 음악 생성',
    file: 'qa/tc-music-generation.md',
    total: 45,
    categories: ['커스텀', '심플', 'YouTube', 'MV', '연장', '다시작곡', 'A/B', '오류', '모델', '엣지케이스'],
    p1: 18, p2: 18, p3: 9,
    list: [
      /* ── 커스텀 모드 (실제값) ── */
      { id:'M01', p:'P1', title:'커스텀: K-Pop 걸그룹', pass:null, params:{mode:'custom',genre:'K-Pop Dance',mood:'energetic, hype',bpm:128,model:'V4',vocal:'f',inst:false,instruments:'Synth,Bass'} },
      { id:'M02', p:'P1', title:'커스텀: 감성 발라드', pass:null, params:{mode:'custom',genre:'Ballad',mood:'sad, emotional',bpm:72,model:'V4_5',vocal:'f',inst:false,instruments:'Piano,Violin'} },
      { id:'M03', p:'P1', title:'커스텀: 힙합 트랩', pass:null, params:{mode:'custom',genre:'Trap',mood:'dark, intense',bpm:140,model:'V4',vocal:'m',inst:false,instruments:'808 Bass,Hi-Hat'} },
      { id:'M04', p:'P2', title:'커스텀: 로파이 인스트', pass:null, params:{mode:'custom',genre:'Lo-Fi Hip Hop',mood:'chill, lofi',bpm:85,model:'V4_5',vocal:'',inst:true,instruments:'Piano,Guitar'} },
      { id:'M05', p:'P2', title:'커스텀: 시네마틱 오케스트라', pass:null, params:{mode:'custom',genre:'Cinematic',mood:'epic, cinematic',bpm:95,model:'V4_5PLUS',vocal:'',inst:true,instruments:'Violin,Piano,Choir'} },
      { id:'M06', p:'P2', title:'커스텀: R&B 소울', pass:null, params:{mode:'custom',genre:'R&B',mood:'romantic, dreamy',bpm:90,model:'V4_5',vocal:'m',inst:false,instruments:'Piano,Bass'} },
      { id:'M07', p:'P3', title:'커스텀: 트로트', pass:null, params:{mode:'custom',genre:'Trot',mood:'happy, uplifting',bpm:130,model:'V4',vocal:'m',inst:false,instruments:'Guitar,Drums'} },
      { id:'M08', p:'P1', title:'커스텀: 크레딧 부족 차단', pass:null, params:{mode:'custom',genre:'Pop',expect:'차단'} },

      /* ── 심플 모드 (실제값) ── */
      { id:'M09', p:'P1', title:'심플: 신나는 댄스곡', pass:null, params:{mode:'simple',desc:'신나는 댄스 파티 음악'} },
      { id:'M10', p:'P1', title:'심플: 슬픈 이별 노래', pass:null, params:{mode:'simple',desc:'비 오는 날 이별을 그리워하는 감성 발라드'} },
      { id:'M11', p:'P2', title:'심플: 1단어 (카페)', pass:null, params:{mode:'simple',desc:'카페'} },
      { id:'M12', p:'P2', title:'심플: 영어 설명', pass:null, params:{mode:'simple',desc:'upbeat pop with female vocals'} },
      { id:'M13', p:'P3', title:'심플: 가사 직접 입력', pass:null, params:{mode:'simple',desc:'로맨틱한 사랑 노래',lyrics:'[Verse]\n너를 처음 본 순간\n세상이 멈춘 것 같았어'} },

      /* ── YouTube 모드 ── */
      { id:'M14', p:'P1', title:'YouTube: 유명 K-Pop 분석', pass:null, params:{mode:'youtube',url:'https://youtube.com/watch?v=dQw4w9WgXcQ'} },
      { id:'M15', p:'P1', title:'YouTube: 잘못된 URL 에러', pass:null, params:{mode:'youtube',url:'https://not-youtube.com/abc',expect:'에러'} },
      { id:'M16', p:'P2', title:'YouTube: Shorts URL', pass:null, params:{mode:'youtube',url:'https://youtube.com/shorts/abc123'} },
      { id:'M17', p:'P2', title:'YouTube: 비공개 영상', pass:null, params:{mode:'youtube',url:'https://youtube.com/watch?v=private123',expect:'에러'} },

      /* ── MV 모드 ── */
      { id:'M18', p:'P1', title:'MV: 기본 text-to-video', pass:null, params:{mode:'mv',prompt:'네온 조명의 밤거리를 걷는 여성 가수',ratio:'9:16',duration:'5s'} },
      { id:'M19', p:'P2', title:'MV: 가로 비율 16:9', pass:null, params:{mode:'mv',prompt:'넓은 초원 위 일몰 풍경',ratio:'16:9',duration:'10s'} },
      { id:'M20', p:'P2', title:'MV: 크레딧 부족 차단', pass:null, params:{mode:'mv',expect:'차단'} },

      /* ── 연장 ── */
      { id:'M21', p:'P1', title:'연장: 기본 연장', pass:null, params:{mode:'extend',model:'V4_5'} },
      { id:'M22', p:'P2', title:'연장: 가사 추가 연장', pass:null, params:{mode:'extend',lyrics:'[Chorus]\n다시 만나자 우리',model:'V4_5'} },
      { id:'M23', p:'P2', title:'연장: 최대 횟수(5회) 제한', pass:null, params:{mode:'extend',expect:'5회 제한 경고'} },
      { id:'M24', p:'P3', title:'연장: 슬라이더 경계값 0/300', pass:null, params:{mode:'extend',continueAt:0} },

      /* ── 다시 작곡 / A/B ── */
      { id:'M25', p:'P1', title:'다시 작곡: 동일 입력 재생성', pass:null, params:{mode:'custom',genre:'Pop',recompose:true} },
      { id:'M26', p:'P1', title:'A/B: 2개 모델 비교 (V4 vs V4.5)', pass:null, params:{mode:'ab',modelA:'V4',modelB:'V4_5'} },
      { id:'M27', p:'P2', title:'A/B: 선호도 투표 저장', pass:null, params:{mode:'ab',expect:'투표 기록'} },

      /* ── 모델별 테스트 ── */
      { id:'M28', p:'P1', title:'모델: V3.5 (빠른 생성)', pass:null, params:{mode:'custom',genre:'Pop',model:'V3_5',mood:'happy, uplifting',bpm:120} },
      { id:'M29', p:'P1', title:'모델: V4.5+ 8분 장곡', pass:null, params:{mode:'custom',genre:'Cinematic',model:'V4_5PLUS',mood:'epic, cinematic',bpm:95} },
      { id:'M30', p:'P1', title:'모델: V5 + audioWeight', pass:null, params:{mode:'custom',genre:'Ballad',model:'V5',mood:'sad, emotional',bpm:72,audioWeight:0.7} },
      { id:'M31', p:'P2', title:'모델: V5 실패 → V4.5 폴백', pass:null, params:{mode:'custom',model:'V5',expect:'폴백'} },
      { id:'M32', p:'P2', title:'모델: Lyria Pro (Google)', pass:null, params:{mode:'custom',model:'LYRIA_PRO',genre:'Pop',mood:'energetic',bpm:128} },
      { id:'M33', p:'P3', title:'모델: Lyria Clip 30초', pass:null, params:{mode:'custom',model:'LYRIA_CLIP',genre:'Electronic'} },
      { id:'M34', p:'P2', title:'모델: Lyria 실패 → V4 폴백', pass:null, params:{mode:'custom',model:'LYRIA_PRO',expect:'폴백'} },

      /* ── 오류/엣지케이스 ── */
      { id:'M35', p:'P1', title:'오류: API 오류 시 UI 복원', pass:null, params:{expect:'버튼 복원+에러 바텀시트'} },
      { id:'M36', p:'P1', title:'오류: 동시 생성 방지 (큐)', pass:null, params:{expect:'큐 대기 표시'} },
      { id:'M37', p:'P2', title:'오류: 부적절 가사 차단', pass:null, params:{mode:'custom',lyrics:'SENSITIVE_WORD_TEST',expect:'차단'} },
      { id:'M38', p:'P2', title:'엣지: 빈 가사로 생성', pass:null, params:{mode:'custom',genre:'Pop',lyrics:'',expect:'가사 자동생성 또는 인스트'} },
      { id:'M39', p:'P3', title:'엣지: 5000자 초과 가사', pass:null, params:{mode:'custom',lyrics:'(5000자 초과)',expect:'잘림 또는 경고'} },
      { id:'M40', p:'P3', title:'엣지: 특수문자 제목', pass:null, params:{mode:'custom',title:'<script>alert(1)</script>',expect:'이스케이프'} },
      { id:'M41', p:'P3', title:'엣지: BPM 0', pass:null, params:{mode:'custom',bpm:0,expect:'기본값 적용'} },
      { id:'M42', p:'P3', title:'엣지: BPM 300', pass:null, params:{mode:'custom',bpm:300,expect:'정상 또는 경고'} },
      { id:'M43', p:'P2', title:'엣지: 중복 생성 방지 (5분 캐시)', pass:null, params:{mode:'custom',genre:'Pop',expect:'캐시 반환'} },
      { id:'M44', p:'P1', title:'엣지: 게스트 5곡 제한', pass:null, params:{mode:'custom',expect:'5곡 후 로그인 유도'} },
      { id:'M45', p:'P3', title:'엣지: 오프라인 시 에러 처리', pass:null, params:{expect:'오프라인 메시지'} },
    ]
  },
  디자인: {
    label: '🎨 디자인/UI',
    file: 'qa/tc-design-ui.md',
    total: 28,
    categories: ['테마', '반응형', '카드', '플레이어', '모달', '로딩', '탭', '배치', '가사', '접근성'],
    p1: 13, p2: 12, p3: 3,
    list: [
      { id:'D01', p:'P1', title:'다크/라이트 모드 전환', pass:null },
      { id:'D02', p:'P2', title:'테마 유지 (새로고침)', pass:null },
      { id:'D03', p:'P2', title:'시스템 다크모드 감지', pass:null },
      { id:'D04', p:'P1', title:'모바일 폭 레이아웃 (375~480px)', pass:null },
      { id:'D05', p:'P2', title:'데스크탑 폭 레이아웃', pass:null },
      { id:'D06', p:'P1', title:'결과 카드 가로 레이아웃', pass:null },
      { id:'D07', p:'P2', title:'커버 이미지 없을 때 플레이스홀더', pass:null },
      { id:'D08', p:'P1', title:'재생 버튼 동작', pass:null },
      { id:'D09', p:'P1', title:'진행 바 클릭 탐색', pass:null },
      { id:'D10', p:'P2', title:'비주얼라이저 애니메이션', pass:null },
      { id:'D11', p:'P1', title:'미니 플레이어 표시', pass:null },
      { id:'D12', p:'P1', title:'풀 플레이어 열기/닫기', pass:null },
      { id:'D13', p:'P1', title:'모달 오버레이 닫기', pass:null },
      { id:'D14', p:'P1', title:'바텀시트 스와이프 닫기', pass:null },
      { id:'D15', p:'P2', title:'바텀시트 Z-index 충돌', pass:null },
      { id:'D16', p:'P2', title:'연장 모달 슬라이더', pass:null },
      { id:'D17', p:'P1', title:'생성 중 로딩 카드 (모드별 색상)', pass:null },
      { id:'D18', p:'P2', title:'이미지 로드 실패 처리', pass:null },
      { id:'D19', p:'P2', title:'토스트 메시지 자동 사라짐', pass:null },
      { id:'D20', p:'P1', title:'탭 전환 (생성/히스토리/커뮤/설정)', pass:null },
      { id:'D21', p:'P1', title:'결과 카드 재생/가사 탭', pass:null },
      { id:'D22', p:'P2', title:'배치 접기/펼치기 애니메이션', pass:null },
      { id:'D23', p:'P2', title:'배치 삭제', pass:null },
      { id:'D24', p:'P2', title:'가사 편집 토글', pass:null },
      { id:'D25', p:'P1', title:'가사 노래방 모드', pass:null },
      { id:'D26', p:'P2', title:'가사 복사', pass:null },
      { id:'D27', p:'P3', title:'버튼 최소 터치 영역 44px', pass:null },
      { id:'D28', p:'P3', title:'색상 대비 WCAG AA', pass:null },
    ]
  },
  커뮤니티: {
    label: '👥 커뮤니티',
    file: 'qa/tc-community.md',
    total: 34,
    categories: ['좋아요', '댓글', '팔로우', '프로필', '피드', '공유', '채팅', '별점', '추천', '콜라보', '신고'],
    p1: 12, p2: 17, p3: 5,
    list: [
      { id:'C01', p:'P1', title:'좋아요 추가', pass:null },
      { id:'C02', p:'P1', title:'좋아요 취소 (toggle)', pass:null },
      { id:'C03', p:'P2', title:'좋아요+싫어요 동시 방지', pass:null },
      { id:'C04', p:'P2', title:'비로그인 좋아요 차단', pass:null },
      { id:'C05', p:'P2', title:'좋아요 순위 반영', pass:null },
      { id:'C06', p:'P1', title:'댓글 작성', pass:null },
      { id:'C07', p:'P1', title:'댓글 목록 조회', pass:null },
      { id:'C08', p:'P2', title:'대댓글 (답글)', pass:null },
      { id:'C09', p:'P2', title:'댓글 300자 제한', pass:null },
      { id:'C10', p:'P2', title:'빈 댓글 전송 방지', pass:null },
      { id:'C11', p:'P3', title:'댓글 Rate Limit', pass:null },
      { id:'C12', p:'P1', title:'팔로우/언팔로우', pass:null },
      { id:'C13', p:'P2', title:'자기 자신 팔로우 방지', pass:null },
      { id:'C14', p:'P2', title:'팔로잉 피드 반영', pass:null },
      { id:'C15', p:'P1', title:'크리에이터 프로필 기본 정보', pass:null },
      { id:'C16', p:'P2', title:'크리에이터 레벨 뱃지', pass:null },
      { id:'C17', p:'P2', title:'프로필 이름 수정', pass:null },
      { id:'C18', p:'P1', title:'피드 기본 로딩', pass:null },
      { id:'C19', p:'P1', title:'정렬 변경 (최신/인기/별점)', pass:null },
      { id:'C20', p:'P2', title:'내 피드 (팔로잉 필터)', pass:null },
      { id:'C21', p:'P2', title:'무한 스크롤/페이징', pass:null },
      { id:'C22', p:'P1', title:'공유 링크 생성', pass:null },
      { id:'C23', p:'P2', title:'OG 메타태그 미리보기', pass:null },
      { id:'C24', p:'P2', title:'삭제 트랙 공유 링크 접근', pass:null },
      { id:'C25', p:'P1', title:'채팅 메시지 전송', pass:null },
      { id:'C26', p:'P2', title:'채팅 100자 제한', pass:null },
      { id:'C27', p:'P2', title:'비속어 필터', pass:null },
      { id:'C28', p:'P2', title:'별점 부여', pass:null },
      { id:'C29', p:'P2', title:'별점 중복 방지', pass:null },
      { id:'C30', p:'P3', title:'데일리 디스커버 로딩', pass:null },
      { id:'C31', p:'P3', title:'출석 체크', pass:null },
      { id:'C32', p:'P2', title:'콜라보 요청 전송', pass:null },
      { id:'C33', p:'P2', title:'콜라보 수락/거절', pass:null },
      { id:'C34', p:'P3', title:'트랙/댓글 신고', pass:null },
    ]
  }
};

COMMANDS['tc'] = COMMANDS['테케'] = COMMANDS['테스트케이스'] = async (chatId, arg) => {
  const parts = (arg || '').trim().split(/\s+/);
  const cat = parts[0].toLowerCase();
  const num = parts[1] || '';

  /* /tc 단독 → 카테고리 목록 */
  if (!cat) {
    const lines = [
      '📋 QA 테스트 케이스',
      '',
      '사용법: tc [카테고리] [번호]',
      '예시: tc 음악  |  tc 디자인 6  |  tc 커뮤니티',
      '',
      '━━ 카테고리 (총 83개 TC) ━━',
    ];
    for (const [key, d] of Object.entries(TC_DATA)) {
      lines.push(`${d.label} — ${d.total}개 (P1:${d.p1} P2:${d.p2} P3:${d.p3})`);
      lines.push(`  /${key}  |  서브카테고리: ${d.categories.slice(0,4).join(', ')} 외`);
    }
    lines.push('', `📄 상세 파일: qa/tc-*.md (GitHub 저장소)`);
    return tgSend(chatId, lines.join('\n'), { parse_mode: '' });
  }

  /* 카테고리 매핑 */
  const keyMap = {
    '음악': '음악', 'music': '음악', 'm': '음악', '생성': '음악',
    '디자인': '디자인', 'design': '디자인', 'd': '디자인', 'ui': '디자인',
    '커뮤니티': '커뮤니티', 'community': '커뮤니티', 'c': '커뮤니티', '커뮤': '커뮤니티',
  };
  const key = keyMap[cat];
  if (!key) {
    return tgSend(chatId, `❓ 카테고리 없음: "${cat}"\n사용 가능: 음악, 디자인, 커뮤니티`, { parse_mode: '' });
  }

  const d = TC_DATA[key];

  /* /tc 음악 6 → 특정 TC 상세 */
  if (num) {
    const idx = parseInt(num) - 1;
    const tc = d.list[idx];
    if (!tc) return tgSend(chatId, `❓ TC #${num} 없음 (범위: 1~${d.total})`, { parse_mode: '' });
    const detail = [
      `${d.label} — TC-${tc.id}`,
      `우선순위: ${tc.p}`,
      `제목: ${tc.title}`,
      `상태: ${tc.pass === true ? '✅ Pass' : tc.pass === false ? '❌ Fail' : '⬜ 미검증'}`,
    ];
    if (tc.params) {
      detail.push('', '━━ 테스트 파라미터 ━━');
      for (const [pk, pv] of Object.entries(tc.params)) {
        if (pv !== undefined && pv !== null && pv !== '') detail.push(`  ${pk}: ${pv}`);
      }
      detail.push('', '실행: tc실행 ' + cat + ' ' + num);
    }
    return tgSend(chatId, detail.join('\n'), { parse_mode: '' });
  }

  /* /tc 음악 → 전체 목록 */
  const p1list = d.list.filter(t => t.p === 'P1');
  const p2list = d.list.filter(t => t.p === 'P2');
  const p3list = d.list.filter(t => t.p === 'P3');

  const lines = [
    `${d.label} TC 목록 (총 ${d.total}개)`,
    `서브: ${d.categories.join(', ')}`,
    '',
    `━━ P1 필수 (${p1list.length}개) ━━`,
    ...p1list.map((t,i) => `${i+1}. TC-${t.id} ${t.title}`),
    '',
    `━━ P2 중요 (${p2list.length}개) ━━`,
    ...p2list.map((t,i) => `${i+1}. TC-${t.id} ${t.title}`),
    '',
    `━━ P3 선택 (${p3list.length}개) ━━`,
    ...p3list.map((t,i) => `${i+1}. TC-${t.id} ${t.title}`),
    '',
    `상세: tc ${key} [번호]  예) tc ${key} 1`,
  ];
  await tgSend(chatId, lines.join('\n'), { parse_mode: '' });
};

/* ── TC 실행 명령 — 실제 파라미터로 생성 테스트 ── */
COMMANDS['tc실행'] = COMMANDS['tcrun'] = COMMANDS['tc테스트'] = async (chatId, arg) => {
  const parts = (arg || '').trim().split(/\s+/);
  const cat = parts[0]?.toLowerCase() || '';
  const num = parseInt(parts[1]) || 0;
  const keyMap = { '음악': '음악', 'music': '음악', 'm': '음악', '생성': '음악' };
  const key = keyMap[cat];
  if (!key || !num) return tgSend(chatId, '⚠️ 사용법: tc실행 음악 1\n\n카테고리와 번호를 입력해주세요.', { parse_mode: '' });

  const d = TC_DATA[key];
  const tc = d?.list[num - 1];
  if (!tc) return tgSend(chatId, `❓ TC #${num} 없음 (범위: 1~${d.total})`, { parse_mode: '' });
  if (!tc.params) return tgSend(chatId, `⚠️ TC-${tc.id}는 파라미터가 없어 자동 실행이 불가합니다.`, { parse_mode: '' });

  const p = tc.params;
  await tgSend(chatId, [
    `🧪 TC-${tc.id} 실행`,
    `📝 ${tc.title}`,
    '',
    '━━ 파라미터 ━━',
    ...Object.entries(p).filter(([,v]) => v !== undefined && v !== '').map(([k,v]) => `  ${k}: ${v}`),
    '',
    p.expect ? `⚡ 예상 결과: ${p.expect}` : '⚡ 예상: 정상 생성 + 오디오 URL 반환',
    '',
    '🤖 Claude Code QA 검증을 시작합니다...',
  ].join('\n'), { parse_mode: '' });

  /* GitHub Issue 생성 → Claude Code 자동 실행 (QA 모드) */
  if (GH_TOKEN) {
    try {
      /* 라벨 생성 */
      try { await ghApi('POST', '/labels', { name: 'claude-fix', color: '7c3aed' }); } catch {}

      const paramStr = Object.entries(p).map(([k,v]) => `- ${k}: ${v}`).join('\n');
      const issue = await ghApi('POST', '/issues', {
        title: `[QA] TC-${tc.id}: ${tc.title}`,
        body: [
          '## QA 테스트 실행',
          '',
          `TC ID: ${tc.id}`,
          `제목: ${tc.title}`,
          `우선순위: ${tc.p}`,
          '',
          '### 테스트 파라미터',
          paramStr,
          '',
          '### 검증 항목',
          p.expect ? `- 예상 결과: ${p.expect}` : '- 정상 생성 확인 (오디오 URL, 히스토리 저장, 크레딧 차감)',
          '- UI 상태 복원 확인 (로딩카드 해제, 버튼 활성화)',
          '- 에러 처리 확인',
          '',
          '### 지시사항',
          '이 TC의 파라미터로 생성 흐름을 코드 레벨에서 검증하세요.',
          '실제 API 호출 없이 코드 흐름 + 파라미터 전달 + 에러 처리를 확인합니다.',
          '결과를 텔레그램으로 보고해주세요.',
          '',
          `---`,
          `> 텔레그램 봇 TC실행 · ${ts()}`,
        ].join('\n'),
        labels: ['claude-fix'],
      });
      await tgSend(chatId, `✅ TC-${tc.id} QA Issue 생성 완료!\n\n📋 Issue #${issue.number}\n🤖 Claude Code가 코드 레벨 검증을 시작합니다.\n\n🔗 ${issue.html_url}`, { parse_mode: '' });
    } catch (e) {
      await tgSend(chatId, `❌ Issue 생성 실패: ${(e.message || '').slice(0, 80)}`, { parse_mode: '' });
    }
  } else {
    await tgSend(chatId, '⚠️ GITHUB_TOKEN이 없어 자동 실행이 불가합니다.\n수동으로 테스트해주세요.', { parse_mode: '' });
  }
};

/* ── TC 결과 기록 ── */
COMMANDS['tc결과'] = COMMANDS['tcresult'] = async (chatId, arg) => {
  const parts = (arg || '').trim().split(/\s+/);
  const tcId = (parts[0] || '').toUpperCase();
  const result = (parts[1] || '').toLowerCase();

  if (!tcId || !['pass', 'fail', 'p', 'f', '성공', '실패'].includes(result)) {
    return tgSend(chatId, '⚠️ 사용법: tc결과 M01 pass\n\n  tc결과 [TC_ID] [pass/fail]\n  예: tc결과 M03 fail', { parse_mode: '' });
  }

  const isPass = ['pass', 'p', '성공'].includes(result);

  /* TC_DATA에서 해당 TC 찾기 */
  let found = null;
  for (const [, d] of Object.entries(TC_DATA)) {
    const tc = d.list.find(t => t.id === tcId);
    if (tc) { found = tc; break; }
  }

  if (!found) return tgSend(chatId, `❓ TC-${tcId}를 찾을 수 없어요.`, { parse_mode: '' });

  found.pass = isPass;

  /* Supabase에 기록 (settings 테이블 활용) */
  if (SB_URL && SB_KEY) {
    try {
      const existing = await sb('GET', `/settings?key=eq.tc_results`);
      const results = existing?.[0]?.value || {};
      results[tcId] = { pass: isPass, ts: Date.now(), by: 'telegram' };
      if (existing?.[0]) {
        await sb('PATCH', `/settings?key=eq.tc_results`, { value: results });
      } else {
        await sb('POST', `/settings`, { key: 'tc_results', value: results });
      }
    } catch (e) { console.warn('[tc-result]', e.message); }
  }

  await tgSend(chatId, `${isPass ? '✅' : '❌'} TC-${tcId}: ${found.title}\n결과: ${isPass ? 'PASS' : 'FAIL'}\n기록 완료!`, { parse_mode: '' });
};

/* ── TC 리포트 — 전체 현황 요약 ── */
COMMANDS['tc리포트'] = COMMANDS['tcreport'] = COMMANDS['tc현황'] = async (chatId) => {
  /* Supabase에서 결과 로드 */
  let savedResults = {};
  if (SB_URL && SB_KEY) {
    try {
      const existing = await sb('GET', `/settings?key=eq.tc_results`);
      savedResults = existing?.[0]?.value || {};
    } catch {}
  }

  const lines = ['📊 QA TC 전체 현황', ''];
  let totalPass = 0, totalFail = 0, totalPending = 0;

  for (const [key, d] of Object.entries(TC_DATA)) {
    let pass = 0, fail = 0, pending = 0;
    d.list.forEach(tc => {
      const saved = savedResults[tc.id];
      if (saved) tc.pass = saved.pass;
      if (tc.pass === true) pass++;
      else if (tc.pass === false) fail++;
      else pending++;
    });
    totalPass += pass; totalFail += fail; totalPending += pending;
    const pct = d.total > 0 ? Math.round((pass / d.total) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    lines.push(`${d.label}`);
    lines.push(`  ${bar} ${pct}% (${pass}/${d.total})`);
    lines.push(`  ✅${pass} ❌${fail} ⬜${pending}`);
    lines.push('');
  }

  const totalAll = totalPass + totalFail + totalPending;
  const totalPct = totalAll > 0 ? Math.round((totalPass / totalAll) * 100) : 0;
  lines.push('━━ 종합 ━━');
  lines.push(`✅ Pass: ${totalPass}  ❌ Fail: ${totalFail}  ⬜ 미검증: ${totalPending}`);
  lines.push(`통과율: ${totalPct}% (${totalPass}/${totalAll})`);

  await tgSend(chatId, lines.join('\n'), { parse_mode: '' });
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

    /* ── callback_query 처리 (인라인 키보드 버튼 클릭) ── */
    if (update?.callback_query) {
      const cbData = update.callback_query.data || '';
      const cbChatId = update.callback_query.message?.chat?.id;
      const cbId = update.callback_query.id;
      /* answerCallbackQuery (버튼 로딩 해제) */
      try { await tgApi('answerCallbackQuery', { callback_query_id: cbId }); } catch (e) {}

      if (cbData.startsWith('retry:') && GH_TOKEN) {
        const issueNum = cbData.split(':')[1];
        try {
          await ghApi('POST', `/issues/${issueNum}/comments`, { body: '## 재시도\n\n이전 수정을 재시도합니다.\n\n---\n> 텔레그램 인라인 버튼 · ' + ts() });
          await tgSend(cbChatId, '🔄 Issue #' + issueNum + ' 재시도 요청! Claude Code가 다시 실행됩니다.', { parse_mode: '' });
        } catch (e) { await tgSend(cbChatId, '❌ 재시도 실패: ' + (e.message || '').slice(0, 60), { parse_mode: '' }); }
      } else if (cbData.startsWith('cancel:') && GH_TOKEN) {
        const issueNum = cbData.split(':')[1];
        try {
          await ghApi('PATCH', `/issues/${issueNum}`, { state: 'closed', state_reason: 'not_planned' });
          await tgSend(cbChatId, '❌ Issue #' + issueNum + ' 취소됨.', { parse_mode: '' });
        } catch (e) { await tgSend(cbChatId, '❌ 취소 실패: ' + (e.message || '').slice(0, 60), { parse_mode: '' }); }
      }
      return res.status(200).json({ ok: true, callback: cbData });
    }

    if (!update?.message?.text) return res.status(200).json({ ok: true, skip: 'no text' });

    const chatId = update.message.chat.id;
    const text = (update.message.text || '').trim();
    const fromUser = update.message.from?.first_name || update.message.from?.username || '?';

    /* 보안: 허용된 chatId만 명령 실행 */
    console.log(`[TG webhook] chatId=${chatId} CHAT_ID=${CHAT_ID} text="${text.slice(0,30)}" match=${String(chatId)===String(CHAT_ID)}`);
    if (CHAT_ID && String(chatId) !== String(CHAT_ID)) {
      console.log(`[TG webhook] REJECTED chatId=${chatId} expected=${CHAT_ID}`);
      await tgSend(chatId, '⛔ 권한이 없습니다. 관리자 채팅에서만 명령을 사용할 수 있어요.\n\n(your chatId: ' + chatId + ')');
      return res.status(200).json({ ok: true, rejected: true });
    }

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
      { re: /진행.*(어때|어디|상황|상태|됐|됨|완료|얼마)|어디.*까지|다\s*됐|끝났|작업.*추적|수정.*(됐|완료|끝)|어떻게.*됐/i, cmd: '진행상황' },
      { re: /취소|중지|cancel|작업.*멈|그만|stop/i, cmd: '취소' },
      { re: /PR.*(있|목록|확인|열린|리스트)|풀리퀘/i, cmd: 'PR' },
      { re: /머지.*(해|하자|ㄱ|go)|합쳐/i, cmd: '머지' },
      { re: /서버.*(상태|어때|정상)|사이트.*(되|살아|정상)|헬스/i, cmd: '상태' },
      { re: /QA|점검|테스트.*전체|버그.*찾|버그.*점검|치명.*버그|전체.*점검/i, cmd: 'QA' },
      { re: /테스트.*케이스|TC목록|테케|tc\s*(음악|디자인|커뮤)/i, cmd: 'tc' },
      { re: /구현.*현황|뭐.*했|뭐.*만들|기능.*목록|어디.*까지.*구현|작업.*내역/i, cmd: '작업' },
      { re: /고도화|phase|업그레이드.*진행|어디.*까지.*고도화/i, cmd: '고도화' },
      { re: /인기.*곡|핫|유행|트렌드|trending/i, cmd: '인기곡' },
      { re: /순위|랭킹|탑|리더보드|ranking/i, cmd: '순위' },
      { re: /플랫폼|인사이트|성장|대시보드|insight/i, cmd: '플랫폼' },
      /* 수정 의도 자연어 감지 */
      { re: /(?:바꿔|변경|수정|고쳐|추가|넣어|삭제|제거|빼).*(줘|해|주|요|좀)|(?:색상|크기|폰트|버튼|이미지|텍스트|문구).*(바꿔|변경|수정)/i, cmd: '수정', extractArg: true },
      { re: /(?:안\s*[되보나돼]|깨져|안\s*나[와옴]|오류|에러|빈\s*화면|작동.*안|클릭.*안|로딩.*안)/i, cmd: '수정', extractArg: true },
      /* QA/TC 자연어 */
      { re: /M\d{2}\s*(테스트|검증|돌려|실행|해봐|해줘|확인)/i, cmd: 'tc실행', extractArg: true, transform: 'tc_id' },
      { re: /(테스트|검증|돌려|실행|해봐|해줘|확인).*M\d{2}/i, cmd: 'tc실행', extractArg: true, transform: 'tc_id' },
      { re: /M\d{2}\s*(통과|성공|패스|pass|됐|됨|ok)/i, cmd: 'tc결과', extractArg: true, transform: 'tc_pass' },
      { re: /M\d{2}\s*(실패|fail|안\s*[되돼]|깨|에러)/i, cmd: 'tc결과', extractArg: true, transform: 'tc_fail' },
      { re: /tc.*(현황|리포트|결과.*보|통과율|몇.*개|얼마나)/i, cmd: 'tc리포트' },
      { re: /테스트.*(현황|결과|리포트|얼마|몇)|QA.*(현황|결과|리포트)/i, cmd: 'tc리포트' },
      { re: /(커스텀|심플|유튜브|MV|연장).*(테스트|검증|확인|돌려)/i, cmd: 'tc', extractArg: true, transform: 'tc_mode' },
    ];
    if (!COMMANDS[cmd]) {
      const full = text.toLowerCase();
      for (const nl of NL_MAP) {
        if (nl.re.test(full)) {
          cmd = nl.cmd;
          if (nl.extractArg) {
            arg = text;
            /* 자연어 변환 */
            if (nl.transform === 'tc_id') {
              const m = text.match(/M(\d{2})/i);
              if (m) arg = '음악 ' + parseInt(m[1]);
            } else if (nl.transform === 'tc_pass') {
              const m = text.match(/M(\d{2})/i);
              if (m) arg = m[0].toUpperCase() + ' pass';
            } else if (nl.transform === 'tc_fail') {
              const m = text.match(/M(\d{2})/i);
              if (m) arg = m[0].toUpperCase() + ' fail';
            } else if (nl.transform === 'tc_mode') {
              const modeMap = { '커스텀': '음악', '심플': '음악', '유튜브': '음악', 'mv': '음악', '연장': '음악' };
              for (const [k, v] of Object.entries(modeMap)) { if (full.includes(k)) { arg = v; break; } }
            }
          } else { arg = ''; }
          break;
        }
      }
    }

    /* 명령 실행 — 완료 후 200 응답 (Vercel은 응답 후 함수 종료 가능) */
    const handler = COMMANDS[cmd];
    if (handler) {
      try {
        await handler(chatId, arg);
      } catch (e) {
        console.error('[TG CMD error]', cmd, e.message);
        await tgSend(chatId, `❌ 명령 실행 오류: ${e.message}`);
      }
    } else {
      /* 활성 세션이 있으면 → Issue 코멘트로 추가 (대화형 세션) */
      const session = await getActiveSession(chatId);
      if (session && GH_TOKEN) {
        try {
          await ghApi('POST', `/issues/${session.issue_number}/comments`, {
            body: `## 추가 지시\n\n${text}\n\n---\n> 텔레그램 봇 · ${ts()}`
          });
          await tgSend(chatId, `💬 Issue #${session.issue_number}에 추가 지시 등록!\nClaude Code가 재실행됩니다.`, { parse_mode: '' });
        } catch (e) {
          await tgSend(chatId, `❌ 코멘트 추가 실패: ${(e.message||'').slice(0,80)}`, { parse_mode: '' });
        }
      } else {
        await tgSend(chatId, `❓ 알 수 없는 명령: \`${cmd}\`\n"도움" 을 입력하면 명령어 목록을 볼 수 있어요.`);
      }
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
