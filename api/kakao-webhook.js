/**
 * /api/kakao-webhook — 카카오 오픈빌더 스킬서버
 *
 * POST → 오픈빌더 스킬 요청 수신 → 명령 처리 → JSON 응답
 */

const SB_URL     = process.env.SUPABASE_URL;
const SB_KEY     = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'kenny2024!';
const GH_TOKEN   = process.env.GITHUB_TOKEN || '';
const GH_REPO    = 'mitiwood/ai-music-studio';
const BASE       = 'https://ai-music-studio-bice.vercel.app';

/* ── 유틸 ── */
function ts() {
  return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

/* 카드형 응답 (제목 + 설명 + 버튼) */
function card(title, desc, buttons = [], quickReplies = []) {
  const res = {
    version: '2.0',
    template: {
      outputs: [{
        textCard: {
          title: title.slice(0, 50),
          description: desc.slice(0, 400),
          buttons: buttons.slice(0, 3).map(b => {
            if (b.url) return { label: b.label, action: 'webLink', webLinkUrl: b.url };
            return { label: b.label, action: 'message', messageText: b.msg || b.label };
          }),
        },
      }],
    },
  };
  if (quickReplies.length) {
    res.template.quickReplies = quickReplies.map(q => ({
      label: q, action: 'message', messageText: q,
    }));
  }
  return res;
}

/* 리스트 카드 응답 */
function listCard(title, items, buttons = [], quickReplies = []) {
  const res = {
    version: '2.0',
    template: {
      outputs: [{
        listCard: {
          header: { title: title.slice(0, 50) },
          items: items.slice(0, 5).map(it => ({
            title: (it.title || '').slice(0, 50),
            description: (it.desc || '').slice(0, 50),
          })),
          buttons: buttons.slice(0, 2).map(b => {
            if (b.url) return { label: b.label, action: 'webLink', webLinkUrl: b.url };
            return { label: b.label, action: 'message', messageText: b.msg || b.label };
          }),
        },
      }],
    },
  };
  if (quickReplies.length) {
    res.template.quickReplies = quickReplies.map(q => ({
      label: q, action: 'message', messageText: q,
    }));
  }
  return res;
}

/* 심플 텍스트 응답 */
function text(msg, quickReplies = []) {
  const res = {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text: msg.slice(0, 1000) } }],
    },
  };
  if (quickReplies.length) {
    res.template.quickReplies = quickReplies.map(q => ({
      label: q, action: 'message', messageText: q,
    }));
  }
  return res;
}

/* ── DB / API 헬퍼 ── */
async function sb(method, path, body = null) {
  if (!SB_URL || !SB_KEY) throw new Error('Supabase 미설정');
  const headers = {
    apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
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

async function ghApi(method, path, body = null) {
  if (!GH_TOKEN) throw new Error('GITHUB_TOKEN 미설정');
  const opts = {
    method,
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}${path}`, opts);
  const txt = await r.text();
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${txt.slice(0, 150)}`);
  return txt ? JSON.parse(txt) : {};
}

/* ── 명령 처리 ── */
const COMMANDS = {};

/* 도움 */
COMMANDS['도움'] = COMMANDS['help'] = async () => {
  return card(
    '🤖 Kenny Bot 명령어',
    [
      '📊 상태 · 트랙 · 유저 · 댓글 · 배포',
      '📝 공지 · 삭제 · 공개 · 비공개',
      '📣 알림 <메시지>',
      '🛠 수정 <지시> · PR · 머지',
      '🔍 QA — 전체 코드 점검',
      '🔄 진행상황 — 작업 추적',
      '📋 기획 · 백로그 · 버그',
      '🎨 디자인 <지시>',
      '📊 사용량 · 일간 · 주간',
      '📖 kie <질문> — API 문서 조회',
    ].join('\n'),
    [
      { label: '서버 상태', msg: '상태' },
      { label: '최근 트랙', msg: '트랙' },
      { label: '사이트 열기', url: BASE },
    ],
    ['상태', '트랙', 'kie', '사용량', 'PR']
  );
};

/* 상태 */
COMMANDS['상태'] = COMMANDS['status'] = async () => {
  const { count: trackCount } = await sb('GET', '/tracks?select=id&limit=0');
  const { count: publicCount } = await sb('GET', '/tracks?is_public=eq.true&select=id&limit=0');
  let userCount = '?', commentCount = '?';
  try { userCount = (await sb('GET', '/users?select=id&limit=0')).count ?? '?'; } catch {}
  try { commentCount = (await sb('GET', '/comments?select=id&limit=0')).count ?? '?'; } catch {}

  const since1h = new Date(Date.now() - 3600000).toISOString();
  let recentCount = 0;
  try { recentCount = (await sb('GET', `/tracks?created_at=gte.${since1h}&select=id&limit=100`)).data.length; } catch {}

  let siteStatus = '?', siteMs = 0;
  try {
    const t0 = Date.now();
    const r = await fetch(BASE, { method: 'HEAD' });
    siteMs = Date.now() - t0;
    siteStatus = r.status >= 200 && r.status < 400 ? '정상' : `이상 (${r.status})`;
  } catch { siteStatus = '접근 불가'; }

  return card(
    '📊 서버 상태',
    [
      `🎵 트랙  ${trackCount ?? '?'}곡 (공개 ${publicCount ?? '?'})`,
      `👥 사용자  ${userCount}명`,
      `💬 댓글  ${commentCount}개`,
      `🕐 최근 1시간  +${recentCount}곡`,
      `🌐 사이트  ${siteStatus} (${siteMs}ms)`,
      `⏰ ${ts()}`,
    ].join('\n'),
    [{ label: '사이트 열기', url: BASE }],
    ['트랙', '유저', '댓글']
  );
};

/* 트랙 */
COMMANDS['트랙'] = COMMANDS['tracks'] = async (arg) => {
  const limit = parseInt(arg) || 5;
  const { data } = await sb('GET', `/tracks?order=created_at.desc&select=id,title,owner_name,gen_mode,comm_likes,is_public,created_at&limit=${Math.min(limit, 5)}`);
  if (!data.length) return text('트랙이 없습니다.');

  const items = data.map(t => {
    const time = new Date(t.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit' });
    const pub = t.is_public !== false ? '🌐' : '🔒';
    const likes = t.comm_likes ? ` ❤️${t.comm_likes}` : '';
    return {
      title: `${pub} ${t.title || '무제'}${likes}`,
      desc: `${t.owner_name || '익명'} · ${t.gen_mode || '?'} · ${time}`,
    };
  });

  return listCard(
    `🎵 최근 트랙 ${data.length}곡`,
    items,
    [{ label: '사이트에서 보기', url: BASE }],
    ['상태', '유저', '댓글']
  );
};

/* 유저 */
COMMANDS['유저'] = COMMANDS['users'] = async () => {
  const { data, count } = await sb('GET', '/users?select=id,name,provider,created_at&order=created_at.desc&limit=5');
  const icons = { google: '🔵', kakao: '💬', naver: '🟢' };

  const items = data.map(u => {
    const time = new Date(u.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    return {
      title: `${icons[u.provider] || '👤'} ${u.name || '?'}`,
      desc: `${u.provider || '?'} · ${time}`,
    };
  });

  return listCard(
    `👥 유저 현황 (총 ${count ?? data.length}명)`,
    items,
    [],
    ['상태', '트랙', '댓글']
  );
};

/* 댓글 */
COMMANDS['댓글'] = COMMANDS['comments'] = async (arg) => {
  let path = '/comments?order=created_at.desc&select=id,track_id,author_name,content,created_at&limit=5';
  if (arg) path = `/comments?track_id=eq.${arg}&order=created_at.desc&select=id,track_id,author_name,content,created_at&limit=5`;
  const { data } = await sb('GET', path);
  if (!data.length) return text('댓글이 없습니다.');

  const items = data.map(c => {
    const time = new Date(c.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
    return {
      title: `${c.author_name || '익명'} · ${time}`,
      desc: (c.content || '').slice(0, 50),
    };
  });

  return listCard('💬 최근 댓글', items, [], ['상태', '트랙', '유저']);
};

/* 배포 */
COMMANDS['배포'] = COMMANDS['deploy'] = async () => {
  const t0 = Date.now();
  const r = await fetch(BASE);
  const ms = Date.now() - t0;
  const ok = r.status >= 200 && r.status < 400;

  return card(
    ok ? '✅ 사이트 정상' : '⚠️ 사이트 이상',
    `HTTP ${r.status} · ${ms}ms\n⏰ ${ts()}`,
    [{ label: '사이트 열기', url: BASE }],
    ['상태', '트랙']
  );
};

/* 공지 */
COMMANDS['공지'] = COMMANDS['announce'] = async (arg) => {
  if (!arg) return text('사용법: 공지 <내용>');
  const r = await fetch(`${BASE}/api/announcement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
    body: JSON.stringify({ text: arg, type: 'info' }),
  });
  const d = await r.json();
  if (d.ok || d.success) return card('✅ 공지 등록 완료', `📢 ${arg}\n⏰ ${ts()}`, [], ['상태']);
  return text(`공지 등록 실패: ${d.error || '알 수 없는 오류'}`);
};

/* 공지삭제 */
COMMANDS['공지삭제'] = async () => {
  const r = await fetch(`${BASE}/api/announcement`, { method: 'DELETE', headers: { Authorization: `Bearer ${ADMIN_SECRET}` } });
  const d = await r.json();
  return card(d.ok || d.success ? '✅ 공지 삭제 완료' : '❌ 삭제 실패', ts(), [], ['상태']);
};

/* 삭제 */
COMMANDS['삭제'] = COMMANDS['delete'] = async (arg) => {
  if (!arg) return text('사용법: 삭제 <트랙ID>');
  const r = await fetch(`${BASE}/api/tracks?id=${encodeURIComponent(arg)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${ADMIN_SECRET}` } });
  const d = await r.json();
  return card(d.success !== false ? '✅ 트랙 삭제 완료' : '❌ 삭제 실패', `ID: ${arg}\n⏰ ${ts()}`, [], ['트랙']);
};

/* 공개 / 비공개 */
COMMANDS['공개'] = async (arg) => {
  if (!arg) return text('사용법: 공개 <트랙ID>');
  await sb('PATCH', `/tracks?id=eq.${arg}`, { is_public: true });
  return card('✅ 트랙 공개 전환', `ID: ${arg}`, [], ['트랙']);
};
COMMANDS['비공개'] = async (arg) => {
  if (!arg) return text('사용법: 비공개 <트랙ID>');
  await sb('PATCH', `/tracks?id=eq.${arg}`, { is_public: false });
  return card('✅ 트랙 비공개 전환', `ID: ${arg}`, [], ['트랙']);
};

/* 댓글삭제 */
COMMANDS['댓글삭제'] = async (arg) => {
  if (!arg) return text('사용법: 댓글삭제 <댓글ID>');
  await sb('DELETE', `/comments?id=eq.${arg}`, null);
  return card('✅ 댓글 삭제 완료', `ID: ${arg}`, [], ['댓글']);
};

/* 알림 */
COMMANDS['알림'] = COMMANDS['push'] = async (arg) => {
  if (!arg) return text('사용법: 알림 <메시지>');
  const r = await fetch(`${BASE}/api/push-send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
    body: JSON.stringify({ title: 'Kenny Music Studio', body: arg }),
  });
  const d = await r.json();
  return card('📣 푸시 발송 완료', `메시지: ${arg}\n전송: ${d.sent ?? 0}/${d.total ?? '?'}`, [], ['상태']);
};

/* 수정 — GitHub Issue → Claude Code Action */
COMMANDS['수정'] = COMMANDS['fix'] = COMMANDS['edit'] = async (arg) => {
  if (!arg) return card('🛠 코드 수정', '사용법: 수정 <지시사항>\n\n예시:\n수정 로그인 버튼 파란색으로\n수정 커뮤니티 로딩 개선', [], ['상태', 'PR']);
  if (!GH_TOKEN) return text('GITHUB_TOKEN 미설정');

  const issue = await ghApi('POST', '/issues', {
    title: `[카카오] ${arg.slice(0, 60)}`,
    body: `## 수정 요청\n\n${arg}\n\n---\n> 카카오톡 봇 · ${ts()}`,
    labels: ['claude-fix'],
  });

  /* 텔레그램으로도 알림 (카카오 알림 불안정 대비) */
  try {
    const tgMsg = `📋 카카오봇 수정 요청\n\nIssue #${issue.number}: ${arg}\n\nClaude Code가 자동 수정 후 PR을 생성합니다.\n완료되면 알림이 옵니다.\n\n${issue.html_url}`;
    await fetch(`${BASE}/api/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${ADMIN_SECRET}` },
      body: JSON.stringify({ text: tgMsg, parse_mode: '' }),
    });
  } catch(e) { console.warn('[kakao-fix-tg]', e.message); }

  return card(
    '✅ 수정 요청 등록',
    `📋 Issue #${issue.number}\n📝 ${arg}\n\n🤖 Claude가 자동으로 코드를 수정합니다.\n완료되면 텔레그램으로 알림이 올 거예요.`,
    [{ label: 'GitHub에서 보기', url: issue.html_url }],
    ['PR', '상태', '진행상황']
  );
};

/* PR */
COMMANDS['pr'] = COMMANDS['PR'] = async () => {
  if (!GH_TOKEN) return text('GITHUB_TOKEN 미설정');
  const prs = await ghApi('GET', '/pulls?state=open&sort=created&direction=desc&per_page=5');
  if (!prs.length) return card('🔀 PR 현황', '열린 PR이 없습니다.', [], ['상태']);

  const items = prs.slice(0, 5).map(pr => {
    const time = new Date(pr.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    return {
      title: `#${pr.number} ${pr.title}`.slice(0, 50),
      desc: `${pr.user?.login || '?'} · ${time}`,
    };
  });

  return listCard(
    `🔀 열린 PR (${prs.length}개)`,
    items,
    [{ label: 'GitHub에서 보기', url: `https://github.com/${GH_REPO}/pulls` }],
    ['상태', '트랙']
  );
};

/* 머지 — 번호 없으면 자동 탐색 */
COMMANDS['머지'] = COMMANDS['merge'] = async (arg) => {
  if (!GH_TOKEN) return text('GITHUB_TOKEN 미설정');
  let prNum = parseInt(arg);

  if (!prNum) {
    try {
      const prs = await ghApi('GET', '/pulls?state=open&sort=created&direction=desc&per_page=10');
      if (!prs.length) return text('📭 열린 PR이 없어요.', ['상태', 'PR']);
      if (prs.length === 1) {
        prNum = prs[0].number;
      } else {
        let msg = `🔀 열린 PR ${prs.length}개\n\n`;
        prs.forEach(pr => { msg += `#${pr.number} ${pr.title}\n`; });
        msg += `\n번호 지정: 머지 ${prs[0].number}`;
        return text(msg, prs.slice(0,3).map(pr => `머지 ${pr.number}`));
      }
    } catch(e) { return text(`❌ PR 조회 실패: ${e.message}`); }
  }

  const pr = await ghApi('GET', `/pulls/${prNum}`);
  if (pr.state !== 'open') return text(`PR #${prNum}은 이미 ${pr.merged ? '머지됨' : '닫힘'} 상태입니다.`);

  const result = await ghApi('PUT', `/pulls/${prNum}/merge`, { merge_method: 'squash', commit_title: pr.title });
  if (result.merged) {
    /* 텔레그램 알림 */
    try {
      await fetch(`${BASE}/api/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${ADMIN_SECRET}` },
        body: JSON.stringify({ text: `✅ PR #${prNum} 머지 완료\n\n${pr.title}\n\n🚀 Vercel 배포 시작`, parse_mode: '' }),
      });
    } catch(e) {}
    return card(
      `✅ PR #${prNum} 머지 완료`,
      `${pr.title}\n\n🚀 Vercel 배포가 시작됩니다.\n약 30초 후 반영됩니다.`,
      [{ label: '사이트 확인', url: BASE }],
      ['배포', '상태']
    );
  }
  return text(`머지 실패: ${result.message || '알 수 없는 오류'}`);
};

/* 진행상황 — GitHub Actions 실행 중인 워크플로우 조회 */
COMMANDS['진행상황'] = COMMANDS['진행'] = COMMANDS['progress'] = async () => {
  if (!GH_TOKEN) return text('⚠️ GITHUB_TOKEN 미설정');
  try {
    const runs = await ghApi('GET', '/actions/runs?status=in_progress&per_page=5');
    const items = runs.workflow_runs || [];
    if (!items.length) {
      return text('✅ 현재 진행 중인 작업이 없어요.\n\n모든 워크플로우가 완료된 상태입니다.', ['상태', 'PR']);
    }
    let msg = `🔄 진행 중인 작업 ${items.length}개\n\n`;
    for (const run of items) {
      const name = run.name || '?';
      const elapsed = Math.round((Date.now() - new Date(run.created_at).getTime()) / 60000);
      let stepInfo = '';
      try {
        const jobs = await ghApi('GET', `/actions/runs/${run.id}/jobs`);
        const job = jobs.jobs?.[0];
        if (job?.steps) {
          const running = job.steps.find(s => s.status === 'in_progress');
          const done = job.steps.filter(s => s.conclusion === 'success').length;
          const total = job.steps.length;
          if (running) stepInfo = `\n  ▶ ${running.name}`;
          stepInfo += `\n  ${done}/${total} 스텝 완료`;
        }
      } catch(e) {}
      msg += `📋 ${name} (${elapsed}분 경과)${stepInfo}\n\n`;
    }
    try {
      const recent = await ghApi('GET', '/actions/runs?status=completed&per_page=1');
      const last = recent.workflow_runs?.[0];
      if (last) {
        const icon = last.conclusion === 'success' ? '✅' : '❌';
        const ago = Math.round((Date.now() - new Date(last.updated_at).getTime()) / 60000);
        msg += `최근 완료: ${icon} ${last.name} (${ago}분 전)`;
      }
    } catch(e) {}
    return text(msg, ['PR', '상태']);
  } catch (e) {
    return text(`❌ 조회 실패: ${e.message}`);
  }
};

/* QA — 전체 점검 → Claude Code Action */
COMMANDS['qa'] = COMMANDS['QA'] = async () => {
  if (!GH_TOKEN) return text('GITHUB_TOKEN 미설정');

  const qaBody = `## QA 전체 점검 요청

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
- 버그 발견 시 즉시 수정, 기존 기능 절대 제거 금지
- 결과를 유니코드 박스 표로 작성
- 점검 완료 후 아래 Python 코드를 Bash로 실행하여 텔레그램+카카오 전송

점검 완료 후 아래 Python으로 결과 전송:
${'```'}
python3 << 'PYEOF'
import urllib.request, json
msg = """QA 전체 점검 결과
(실제 결과에 맞게 표 작성)
"""
tg = json.dumps({'text': msg, 'parse_mode': ''}, ensure_ascii=False).encode('utf-8')
urllib.request.urlopen(urllib.request.Request('https://ai-music-studio-bice.vercel.app/api/telegram', data=tg, headers={'Content-Type':'application/json; charset=utf-8','Authorization':'Bearer kenny2024!'}))
kk = json.dumps({'text': msg}, ensure_ascii=False).encode('utf-8')
urllib.request.urlopen(urllib.request.Request('https://ai-music-studio-bice.vercel.app/api/kakao-notify', data=kk, headers={'Content-Type':'application/json; charset=utf-8'}))
PYEOF
${'```'}

---
> 카카오톡 봇에서 요청됨 · ${ts()}`;

  const issue = await ghApi('POST', '/issues', {
    title: `[QA] 전체 점검 · ${ts()}`,
    body: qaBody,
    labels: ['claude-fix'],
  });

  return card(
    '🔍 QA 점검 시작',
    `📋 Issue #${issue.number}\n\n🤖 Claude Code가 10개 항목을 점검합니다.\n완료되면 텔레그램+카카오로 결과표가 옵니다.`,
    [{ label: 'GitHub에서 보기', url: issue.html_url }],
    ['PR', '상태']
  );
};

/* ── 📋 기획 명령어 ── */

COMMANDS['기획'] = COMMANDS['plan'] = async (arg) => {
  if (!arg) return card('📋 기획', '사용법: 기획 <기능 설명>\n\n예시:\n기획 다크모드 지원\n기획 플레이리스트 공유 기능', [], ['백로그', '상태']);
  if (!GH_TOKEN) return text('GITHUB_TOKEN 미설정');
  const issue = await ghApi('POST', '/issues', {
    title: `[기획] ${arg.slice(0, 60)}`,
    body: `## 기능 요구사항\n\n${arg}\n\n### 체크리스트\n- [ ] 요구사항 정의\n- [ ] 디자인 검토\n- [ ] 개발\n- [ ] QA\n- [ ] 배포\n\n---\n> 카카오 봇 · ${ts()}`,
    labels: ['enhancement'],
  });
  return card('✅ 기획 등록 완료', `📋 Issue #${issue.number}\n📝 ${arg}`, [{ label: 'GitHub에서 보기', url: issue.html_url }], ['백로그', '상태']);
};

COMMANDS['백로그'] = COMMANDS['backlog'] = async () => {
  if (!GH_TOKEN) return text('GITHUB_TOKEN 미설정');
  const issues = await ghApi('GET', '/issues?state=open&sort=created&direction=desc&per_page=5');
  const filtered = issues.filter(i => !i.pull_request);
  if (!filtered.length) return text('열린 Issue가 없습니다.', ['상태']);
  const items = filtered.slice(0, 5).map(i => ({
    title: `#${i.number} ${i.title}`.slice(0, 50),
    desc: (i.labels?.map(l => l.name).join(', ') || '라벨 없음').slice(0, 50),
  }));
  return listCard(`📋 백로그 (${filtered.length}개)`, items, [{ label: 'GitHub에서 보기', url: `https://github.com/${GH_REPO}/issues` }], ['기획', 'PR']);
};

COMMANDS['버그'] = COMMANDS['bug'] = async (arg) => {
  if (!arg) return card('🐛 버그 리포트', '사용법: 버그 <설명>\n\n예시:\n버그 모바일 재생 안됨\n버그 로그인 후 깜빡임', [], ['백로그']);
  if (!GH_TOKEN) return text('GITHUB_TOKEN 미설정');
  const issue = await ghApi('POST', '/issues', {
    title: `[버그] ${arg.slice(0, 60)}`,
    body: `## 버그 리포트\n\n**현상:** ${arg}\n\n---\n> 카카오 봇 · ${ts()}`,
    labels: ['bug'],
  });
  return card('🐛 버그 등록 완료', `Issue #${issue.number}\n${arg}\n\nAI 수정: "수정 ${arg}"`, [{ label: 'GitHub에서 보기', url: issue.html_url }], ['백로그', '수정']);
};

/* ── 🎨 디자인 ── */

COMMANDS['디자인'] = COMMANDS['design'] = async (arg) => {
  if (!arg) return card('🎨 디자인', '사용법: 디자인 <지시사항>\n\n예시:\n디자인 버튼 둥글게\n디자인 다크모드 색상', [], ['상태']);
  if (!GH_TOKEN) return text('GITHUB_TOKEN 미설정');
  const issue = await ghApi('POST', '/issues', {
    title: `[디자인] ${arg.slice(0, 60)}`,
    body: `## 디자인 수정\n\n${arg}\n\n규칙: CSS/UI만 수정, 로직 변경 금지, 반응형 유지\n\n---\n> 카카오 봇 · ${ts()}`,
    labels: ['claude-fix', 'design'],
  });
  return card('🎨 디자인 요청 등록', `Issue #${issue.number}\n${arg}\n\nClaude가 CSS/UI를 수정합니다.`, [{ label: 'GitHub에서 보기', url: issue.html_url }], ['PR', '상태']);
};

/* ── 📊 사용량 ── */

COMMANDS['사용량'] = COMMANDS['usage'] = COMMANDS['stats'] = async () => {
  const { count: trackCount } = await sb('GET', '/tracks?select=id&limit=0');
  const { count: publicCount } = await sb('GET', '/tracks?is_public=eq.true&select=id&limit=0');
  let userCount = '?', commentCount = '?';
  try { userCount = (await sb('GET', '/users?select=id&limit=0')).count ?? '?'; } catch {}
  try { commentCount = (await sb('GET', '/comments?select=id&limit=0')).count ?? '?'; } catch {}

  const today = new Date().toISOString().split('T')[0];
  let todayTracks = 0, todayUsers = 0;
  try { todayTracks = (await sb('GET', `/tracks?created_at=gte.${today}&select=id&limit=100`)).data.length; } catch {}
  try { todayUsers = (await sb('GET', `/users?created_at=gte.${today}&select=id&limit=100`)).data.length; } catch {}

  return card(
    '📊 사용량 대시보드',
    [
      `🎵 트랙  ${trackCount ?? '?'}곡 (공개 ${publicCount ?? '?'}) / 오늘 +${todayTracks}`,
      `👥 사용자  ${userCount}명 / 오늘 +${todayUsers}`,
      `💬 댓글  ${commentCount}개`,
      `⏰ ${ts()}`,
    ].join('\n'),
    [{ label: '사이트 열기', url: BASE }],
    ['일간', '주간', '상태']
  );
};

COMMANDS['일간'] = COMMANDS['daily'] = async () => {
  const today = new Date().toISOString().split('T')[0];
  const { data: tracks } = await sb('GET', `/tracks?created_at=gte.${today}&select=id,title,owner_name,gen_mode&order=created_at.desc&limit=50`);
  const { data: users } = await sb('GET', `/users?created_at=gte.${today}&select=id,name,provider&order=created_at.desc&limit=50`);
  const { data: comments } = await sb('GET', `/comments?created_at=gte.${today}&select=id,author_name,content&order=created_at.desc&limit=50`);

  let desc = `🎵 트랙 +${tracks.length} / 👥 사용자 +${users.length} / 💬 댓글 +${comments.length}\n\n`;
  if (tracks.length) {
    desc += '최근 트랙:\n';
    tracks.slice(0, 3).forEach(t => { desc += `· ${t.title || '무제'} (${t.owner_name || '익명'})\n`; });
  }
  if (!tracks.length && !users.length && !comments.length) desc += '💤 오늘은 활동이 없습니다.';

  return card(`📅 일간 리포트 (${today})`, desc, [], ['주간', '사용량', '상태']);
};

COMMANDS['주간'] = COMMANDS['weekly'] = async () => {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: tracks } = await sb('GET', `/tracks?created_at=gte.${since}&select=id,gen_mode,created_at&limit=500`);
  const { data: users } = await sb('GET', `/users?created_at=gte.${since}&select=id,provider&limit=500`);
  const { data: comments } = await sb('GET', `/comments?created_at=gte.${since}&select=id&limit=500`);

  const modes = {};
  tracks.forEach(t => { modes[t.gen_mode || '?'] = (modes[t.gen_mode || '?'] || 0) + 1; });
  const providers = {};
  users.forEach(u => { providers[u.provider || '?'] = (providers[u.provider || '?'] || 0) + 1; });

  let desc = `🎵 트랙 ${tracks.length}곡 / 👥 사용자 ${users.length}명 / 💬 댓글 ${comments.length}개\n\n`;
  desc += '모드별: ' + Object.entries(modes).map(([m, c]) => `${m}(${c})`).join(', ') + '\n';
  desc += '소셜별: ' + Object.entries(providers).map(([p, c]) => `${p}(${c})`).join(', ');

  return card('📊 주간 리포트 (7일)', desc, [{ label: '사이트 열기', url: BASE }], ['일간', '사용량', '상태']);
};

/* ── 📖 kie.ai API 레퍼런스 조회 ── */
const KIE_SECTIONS = {
  '1': { title: '기본 정보', keywords: ['기본','인증','크레딧','가격','pricing','rate'] },
  '2.1': { title: '음악 생성', keywords: ['음악','생성','generate','만들기','작곡'] },
  '2.2': { title: '곡 연장', keywords: ['연장','extend','이어'] },
  '2.3': { title: '보컬 변환', keywords: ['보컬','vocal','변환'] },
  '2.4': { title: '타임스탬프 가사', keywords: ['카라오케','타임스탬프','싱크'] },
  '3': { title: '가사 생성', keywords: ['가사','lyrics','작사'] },
  '4': { title: '비디오 생성', keywords: ['비디오','video','mv','뮤직비디오'] },
  '5': { title: 'Chat Completion', keywords: ['llm','채팅','chat','gemini'] },
  '6': { title: '모델 목록', keywords: ['모델','model','목록'] },
  '7': { title: '에러 코드', keywords: ['에러','오류','error'] },
  '8': { title: '폴링 전략', keywords: ['폴링','polling'] },
  '9': { title: '콜백', keywords: ['콜백','callback','webhook'] },
  '10': { title: '사용 중 엔드포인트', keywords: ['전체','endpoint','api목록'] },
};

COMMANDS['kie'] = COMMANDS['api'] = async (arg) => {
  if (!arg) {
    const list = Object.entries(KIE_SECTIONS).map(([k,v]) => `${k}. ${v.title}`).join('\n');
    return card('📖 kie.ai API 레퍼런스', list, [
      { label: '음악 생성', msg: 'kie 음악' },
      { label: '가사 생성', msg: 'kie 가사' },
    ], ['kie 모델', 'kie 에러', 'kie 3', 'kie 비디오']);
  }

  const directKey = Object.keys(KIE_SECTIONS).find(k => k === arg || k === arg.replace('번',''));
  const keywordKey = !directKey ? Object.entries(KIE_SECTIONS).find(([k,v]) =>
    v.keywords.some(kw => arg.toLowerCase().includes(kw))
  )?.[0] : null;
  const matchKey = directKey || keywordKey;

  if (!matchKey) {
    return card('❓ 섹션 없음', `"${arg}"에 해당하는 섹션이 없어요.\n\n"kie"를 입력하면 목록을 볼 수 있어요.`, [], ['kie']);
  }

  const section = KIE_SECTIONS[matchKey];
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${GH_REPO}/main/KIE_API_REFERENCE.md`);
    if (!r.ok) throw new Error('로드 실패');
    const md = await r.text();

    const sectionNum = matchKey.split('.')[0];
    const pattern = matchKey.includes('.')
      ? new RegExp(`### ${matchKey.replace('.','\\.')}[^\\n]*\\n([\\s\\S]*?)(?=###|## \\d|$)`)
      : new RegExp(`## ${sectionNum}\\.\\s[^\\n]*\\n([\\s\\S]*?)(?=\\n## \\d|$)`);

    const match = md.match(pattern);
    let content = match ? match[0].replace(/[#*`|]/g,'').trim() : `${matchKey}. ${section.title} (내용 추출 실패)`;

    /* 카카오 카드 제한: 설명 400자 */
    if (content.length > 380) content = content.slice(0, 380) + '...';

    return card(`📖 ${matchKey}. ${section.title}`, content, [
      { label: '전체 목록', msg: 'kie' },
      { label: 'MD 파일 보기', url: `https://github.com/${GH_REPO}/blob/main/KIE_API_REFERENCE.md` },
    ], ['kie 모델', 'kie 에러', 'kie 가사']);
  } catch (e) {
    return card('❌ 로드 실패', e.message, [{ label: 'GitHub에서 보기', url: `https://github.com/${GH_REPO}/blob/main/KIE_API_REFERENCE.md` }]);
  }
};

/* ── 메인 핸들러 ── */
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    return res.status(200).json(text('카카오톡 봇 스킬서버입니다. "도움"을 입력하세요.'));
  }

  try {
    const body = req.body || {};
    const utterance = (body.userRequest?.utterance || '').trim();

    if (!utterance) {
      return res.status(200).json(card('🤖 Kenny Bot', '"도움"을 입력하면 명령어를 볼 수 있어요.', [], ['도움']));
    }

    const parts = utterance.replace(/^\//, '').split(/\s+/);
    let cmd = parts[0].toLowerCase();
    let arg = parts.slice(1).join(' ').trim();

    /* 자연어 → 명령 매핑 */
    const NL_MAP = [
      { re: /진행.*(어때|어디|상황|상태|됐|됨|완료|얼마)|어디.*까지|다\s*됐|끝났|작업.*추적/i, cmd: '진행상황' },
      { re: /PR.*(있|목록|확인|열린|리스트)|풀리퀘/i, cmd: 'PR' },
      { re: /머지.*(해|하자|ㄱ|go)|합쳐/i, cmd: '머지' },
      { re: /서버.*(상태|어때|정상)|사이트.*(되|살아|정상)|헬스/i, cmd: '상태' },
      { re: /QA|점검|테스트.*전체|버그.*찾/i, cmd: 'QA' },
      { re: /kie.*api|api.*문서|레퍼런스|음악.*api|가사.*api/i, cmd: 'kie' },
    ];
    if (!COMMANDS[cmd]) {
      const full = utterance.toLowerCase();
      for (const nl of NL_MAP) {
        if (nl.re.test(full)) { cmd = nl.cmd; arg = ''; break; }
      }
    }

    const handler = COMMANDS[cmd];
    if (handler) {
      try {
        const result = await handler(arg);
        return res.status(200).json(result);
      } catch (e) {
        console.error('[Kakao CMD error]', cmd, e.message);
        return res.status(200).json(card('❌ 오류', e.message, [], ['도움']));
      }
    }

    return res.status(200).json(
      card('❓ 알 수 없는 명령', `"${cmd}"\n\n"도움"을 입력해보세요.`, [{ label: '명령어 보기', msg: '도움' }], ['도움', '상태', '트랙'])
    );
  } catch (e) {
    return res.status(200).json(card('❌ 시스템 오류', e.message, [], ['도움']));
  }
}
