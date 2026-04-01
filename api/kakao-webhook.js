/**
 * /api/kakao-webhook — 카카오 오픈빌더 스킬서버
 *
 * POST → 오픈빌더 스킬 요청 수신 → 명령 처리 → JSON 응답
 */

const SB_URL     = process.env.SUPABASE_URL;
const SB_KEY     = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const KIE_API_KEY = process.env.KIE_API_KEY || '';
const GH_TOKEN   = process.env.GITHUB_TOKEN || '';
const GH_REPO    = 'mitiwood/ai-music-studio';
const BASE       = 'https://ddinggok.com';
const KIE_BASE   = 'https://api.kie.ai';
const CALLBACK   = `${BASE}/api/callback`;

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
    '🤖 Kenny Bot',
    [
      '🎵 음악: 커스텀 · 심플 · 유튜브 · MV',
      '📊 모니터링: 상태 · 헬스 · 트랙 · 유저 · 댓글',
      '📝 관리: 공지 · 삭제 · 공개 · 비공개',
      '🛠 개발: 수정 [화면] · PR · 머지 · QA',
      '🔀 Git: 브랜치 · 이슈 · PR닫기 · 커밋',
      '📊 분석: 사용량 · 일간 · 주간 · 인기곡 · 순위',
      '📖 문서: mc <파일명>',
    ].join('\n'),
    [
      { label: '커스텀 생성', msg: '커스텀' },
      { label: '심플 생성', msg: '심플' },
      { label: '사이트 열기', url: BASE },
    ],
    ['커스텀', '심플', '유튜브', 'MV', '상태']
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

/* 헬스체크 — API/DB 전체 점검 */
COMMANDS['헬스'] = COMMANDS['health'] = COMMANDS['점검'] = async () => {
  const checks = [];

  /* 1. Supabase DB */
  try {
    const t0 = Date.now();
    const { count } = await sb('GET', '/tracks?select=id&limit=0');
    const ms = Date.now() - t0;
    checks.push(`✅ Supabase DB — ${ms}ms (${count}곡)`);
  } catch (e) {
    checks.push(`❌ Supabase DB — ${e.message.slice(0, 60)}`);
  }

  /* 2. Supabase Auth (users 테이블) */
  try {
    const t0 = Date.now();
    const { count } = await sb('GET', '/users?select=id&limit=0');
    const ms = Date.now() - t0;
    checks.push(`✅ Supabase Users — ${ms}ms (${count}명)`);
  } catch (e) {
    checks.push(`❌ Supabase Users — ${e.message.slice(0, 60)}`);
  }

  /* 3. kie.ai API */
  try {
    const t0 = Date.now();
    const r = await fetch('https://api.kie.ai/api/v1/generate/record-info?taskId=test', {
      headers: { Authorization: `Bearer ${KIE_API_KEY}` },
    });
    const ms = Date.now() - t0;
    checks.push(r.status < 500 ? `✅ kie.ai API — ${ms}ms (HTTP ${r.status})` : `⚠️ kie.ai API — ${ms}ms (HTTP ${r.status})`);
  } catch (e) {
    checks.push(`❌ kie.ai API — ${e.message.slice(0, 60)}`);
  }

  /* 4. 사이트 */
  try {
    const t0 = Date.now();
    const r = await fetch(BASE, { method: 'HEAD' });
    const ms = Date.now() - t0;
    checks.push(r.status < 400 ? `✅ 사이트 — ${ms}ms` : `⚠️ 사이트 — ${ms}ms (HTTP ${r.status})`);
  } catch (e) {
    checks.push(`❌ 사이트 — ${e.message.slice(0, 60)}`);
  }

  /* 5. 텔레그램 봇 */
  try {
    const t0 = Date.now();
    const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN || ''}/getMe`);
    const ms = Date.now() - t0;
    const d = await r.json();
    checks.push(d.ok ? `✅ 텔레그램 봇 — ${ms}ms (@${d.result?.username})` : `❌ 텔레그램 봇 — ${d.description}`);
  } catch (e) {
    checks.push(`❌ 텔레그램 봇 — ${e.message.slice(0, 60)}`);
  }

  /* 6. 카카오 알림 */
  try {
    const t0 = Date.now();
    const r = await fetch(`${BASE}/api/kakao-notify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '' }) });
    const ms = Date.now() - t0;
    checks.push(r.status < 500 ? `✅ 카카오 알림 — ${ms}ms` : `⚠️ 카카오 알림 — HTTP ${r.status}`);
  } catch (e) {
    checks.push(`❌ 카카오 알림 — ${e.message.slice(0, 60)}`);
  }

  /* 7. GitHub API */
  if (GH_TOKEN) {
    try {
      const t0 = Date.now();
      await ghApi('GET', '');
      const ms = Date.now() - t0;
      checks.push(`✅ GitHub API — ${ms}ms`);
    } catch (e) {
      checks.push(`❌ GitHub API — ${e.message.slice(0, 60)}`);
    }
  } else {
    checks.push(`⚠️ GitHub API — 토큰 미설정`);
  }

  const ok = checks.filter(c => c.startsWith('✅')).length;
  const total = checks.length;
  const emoji = ok === total ? '💚' : ok >= total - 1 ? '💛' : '🔴';

  return card(
    `${emoji} 시스템 헬스체크 (${ok}/${total})`,
    checks.join('\n') + `\n\n⏰ ${ts()}`,
    [{ label: '사이트 열기', url: BASE }],
    ['상태', '트랙']
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

/* 로그 — 최근 봇 발송 기록 조회 */
COMMANDS['로그'] = COMMANDS['log'] = COMMANDS['logs'] = async (arg) => {
  const limit = Math.min(parseInt(arg) || 10, 20);
  const { data } = await sb('GET', `/bot_logs?select=channel,text,created_at&order=created_at.desc&limit=${limit}`);
  if (!data || !data.length) return text('📭 봇 발송 기록이 없습니다.', ['상태', '도움']);
  let lines = [`📋 최근 봇 알림 ${data.length}건\n`];
  data.forEach((d, i) => {
    const ch = d.channel === 'telegram' ? '📨TG' : '💬KA';
    const t = new Date(d.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const preview = (d.text || '').replace(/\n/g, ' ').slice(0, 60);
    lines.push(`${ch} ${t} ${preview}`);
  });
  return text(lines.join('\n'), ['상태', '트랙', '도움']);
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
    body: JSON.stringify({ title: '공지사항', body: arg, type: 'info' }),
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
  if (!arg) return card('🛠 코드 수정', '사용법: 수정 [화면] <지시사항>\n\n[화면] 태그로 빠르고 저렴하게!\n태그 사용: ~$0.05~0.15/건\n태그 없음: ~$0.50~1.00/건\n\n예시:\n수정 [설정] 이용약관 링크 수정\n수정 [풀플레이어] 볼륨 슬라이더 추가\n수정 [커뮤채팅] 메시지 삭제 기능\n수정 [css플레이어] 배경색 변경\n\n65개 태그: 생성/히스토리/커뮤니티/설정/테마/풀플레이어/미니플레이어/가사/리믹스/연장/커버/보컬/노래방/피드/채팅/크리에이터/댓글/프로필/플랜/css/js/api/봇 등\n\n태그 없이도 사용 가능 (전체 탐색)', [], ['상태', 'PR']);
  if (!GH_TOKEN) return text('GITHUB_TOKEN 미설정');

  /* [화면] 태그가 있으면 제목에 보존 */
  const tagMatch = arg.match(/^\[([^\]]+)\]/);
  const titleTag = tagMatch ? `${tagMatch[0]} ` : '';
  const titleText = tagMatch ? arg.slice(tagMatch[0].length).trim().slice(0, 60) : arg.slice(0, 60);
  const issue = await ghApi('POST', '/issues', {
    title: `${titleTag}${titleText}`,
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

/* 청소 — stale 브랜치 정리 */
COMMANDS['청소'] = COMMANDS['cleanup'] = async () => {
  if (!GH_TOKEN) return text('⚠️ GITHUB_TOKEN 미설정');

  const days = 7;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  try {
    const branches = await ghApi('GET', '/branches?per_page=100');
    const staleBranches = [];

    for (const b of branches) {
      if (!b.name.startsWith('claude/issue-') && !b.name.startsWith('fix/issue-')) continue;
      try {
        const commit = await ghApi('GET', `/commits/${b.commit.sha}`);
        if (commit.commit.author.date < cutoff) {
          staleBranches.push({ name: b.name, date: commit.commit.author.date.slice(0, 10) });
        }
      } catch(e) { continue; }
    }

    if (!staleBranches.length) return text('✅ 7일 이상 된 stale 브랜치가 없습니다.', ['상태', 'PR']);

    let deleted = 0;
    for (const sb of staleBranches) {
      try { await ghApi('DELETE', `/git/refs/heads/${sb.name}`); deleted++; } catch(e) {}
    }

    return text(`🧹 브랜치 정리 완료\n\n삭제: ${deleted}/${staleBranches.length}개\n기준: ${days}일 이상`, ['상태', 'PR']);
  } catch(e) {
    return text(`❌ 브랜치 정리 실패: ${e.message}`);
  }
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
urllib.request.urlopen(urllib.request.Request('https://ddinggok.com/api/telegram', data=tg, headers={'Content-Type':'application/json; charset=utf-8','Authorization':'Bearer ${ADMIN_SECRET}'}))
kk = json.dumps({'text': msg}, ensure_ascii=False).encode('utf-8')
urllib.request.urlopen(urllib.request.Request('https://ddinggok.com/api/kakao-notify', data=kk, headers={'Content-Type':'application/json; charset=utf-8'}))
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
/* ── 📋 작업이력 / 구현현황 조회 ── */
const WORK_CATEGORIES = {
  '음악': { icon: '🎵', title: '음악 고도화', count: 12, top: ['프리셋10개', 'A/B비교', '가사에디터', '리믹스6프리셋', '보컬라이브러리6종', 'AI어시스턴트'] },
  'UI': { icon: '🎨', title: 'Suno UI/UX', count: 9, top: ['SVG아이콘', '3열리스트', '재생동기화', '데이모드', 'MZ로딩'] },
  '리믹스': { icon: '🎤', title: '리믹스&커버', count: 5, top: ['리믹스4종', '커버바텀시트', 'add-vocals수정'] },
  'AI': { icon: '🤖', title: 'AI 추천', count: 4, top: ['컨셉추천', '제목자동생성', '한글번역'] },
  '문서': { icon: '📖', title: '문서&스킬', count: 4, top: ['SPEC.md', 'KIE레퍼런스', '/kie스킬'] },
  '공유': { icon: '🔗', title: '카카오공유', count: 4, top: ['SDK로드', '스토리제거', '폴백체인'] },
  '버그': { icon: '🚨', title: '버그수정', count: 7, top: ['Markdown제거9파일', '알림누락해결', '플랜통합', '서버검증API'] },
  '봇': { icon: '🤖', title: '봇시스템', count: 5, top: ['사용량통합', 'kie명령', '작업명령', '실시간알림'] },
};

COMMANDS['작업'] = COMMANDS['구현'] = COMMANDS['현황'] = COMMANDS['work'] = async (arg) => {
  const argLower = (arg||'').toLowerCase();
  const matchKey = arg ? Object.keys(WORK_CATEGORIES).find(k =>
    argLower.includes(k) || argLower.includes(WORK_CATEGORIES[k].title.slice(0,3))
  ) : null;

  if (matchKey) {
    const cat = WORK_CATEGORIES[matchKey];
    return card(
      `${cat.icon} ${cat.title} (${cat.count}개)`,
      cat.top.map((t, i) => `${i+1}. ${t}`).join('\n'),
      [{ label: '전체 현황', msg: '작업' }],
      ['작업 음악', '작업 버그', '작업 UI']
    );
  }

  const total = Object.values(WORK_CATEGORIES).reduce((s, c) => s + c.count, 0);
  const lines = Object.entries(WORK_CATEGORIES).map(([k, c]) => `${c.icon} ${c.title}: ${c.count}개`);
  return card(
    `📋 구현 현황 (${total}개)`,
    lines.join('\n'),
    [{ label: '음악 상세', msg: '작업 음악' }, { label: '버그 상세', msg: '작업 버그' }],
    ['작업 음악', '작업 UI', '작업 버그', '작업 봇']
  );
};

/* ── 🚀 고도화 진행 현황 ── */
const UP = {
  '2':{t:'안정화',p:100,i:['셀렉터수정','WebKit','레이스방지','대소문자','플랜동기화']},
  '3':{t:'리텐션',p:100,i:['출석+스트릭','복귀보너스','좋아요중복','소유자알림','인기차트']},
  '4':{t:'수익화',p:100,i:['크레딧팩','비교재생','전환트리거','프리미엄미끼','프로필']},
  '5':{t:'기술',p:80,i:['Realtime','JWT인증','모듈분리(미완)']},
  '6':{t:'확장',p:100,i:['AI DJ','앨범','라이선스','크레딧팩']},
};
COMMANDS['고도화'] = COMMANDS['upgrade'] = COMMANDS['phase'] = async (arg) => {
  if(arg && UP[arg]){
    const p=UP[arg];
    return card(`🚀 Phase ${arg}: ${p.t} (${p.p}%)`, p.i.map((x,i)=>(i+1)+'. '+x).join('\n'), [{label:'전체 현황',msg:'고도화'}], ['고도화 2','고도화 3','고도화 4','고도화 5']);
  }
  /* "고도화 진행 <지시>" → 구현 트리거 */
  const isAction = arg && (arg.startsWith('진행') || arg.startsWith('구현') || arg.startsWith('추가') || arg.length > 10);
  if (isAction) {
    const instruction = arg.replace(/^(진행|구현|추가|개발)\s*/, '').trim() || arg;
    if (!GH_TOKEN) return text('GITHUB_TOKEN 미설정');
    try {
      const ghReq = await fetch(`https://api.github.com/repos/${GH_REPO}/issues`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `[고도화] ${instruction.slice(0,60)}`, body: `## 고도화 요청\n\n${instruction}\n\n> 카카오봇 고도화 명령`, labels: ['claude-fix'] }),
      });
      const issue = await ghReq.json();
      if (ghReq.ok) {
        return card('✅ 고도화 요청 등록!', `Issue #${issue.number}\n${instruction}\n\nClaude Code가 자동 구현 → PR 생성`, [{label:'Issue 보기',url:issue.html_url}], ['머지','PR','고도화']);
      }
      return text('Issue 생성 실패: ' + (issue.message||'').slice(0,100));
    } catch (e) { return text('오류: ' + e.message); }
  }

  const avg=Math.round(Object.values(UP).reduce((s,v)=>s+v.p,0)/Object.keys(UP).length);
  const lines=Object.entries(UP).map(([k,v])=>`Phase ${k} ${v.t}: ${'█'.repeat(v.p/10)}${'░'.repeat(10-v.p/10)} ${v.p}%`);
  return card(`🚀 고도화 (${avg}%)`, lines.join('\n')+'\n\n구현: 고도화 진행 <지시>', [{label:'Phase 3',msg:'고도화 3'},{label:'구현 예시',msg:'고도화 진행 모듈 분리'}], ['고도화 2','고도화 3','고도화 5']);
};

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
    const _ghHeaders = GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github.raw' } : {};
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/KIE_API_REFERENCE.md?ref=main`, { headers: _ghHeaders });
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

/* ── 📈 인사이트 명령어 ── */

/* 인기곡 — 인기 트랙 TOP 10 */
COMMANDS['인기곡'] = async (arg) => {
  const medals = ['🥇','🥈','🥉'];
  let hours = 24, label = '24시간';
  if (arg && (arg.includes('주간') || arg.includes('7d'))) { hours = 168; label = '주간'; }
  else if (arg && (arg.includes('월간') || arg.includes('30d'))) { hours = 720; label = '월간'; }

  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const { data } = await sb('GET', `/tracks?created_at=gte.${since}&select=id,title,owner_name,comm_likes,comm_plays,gen_mode&order=comm_likes.desc,comm_plays.desc&limit=10`);

  if (!data.length) return text(`${label} 기간 트랙이 없습니다.`, ['순위', '플랫폼', '장르']);

  let msg = `🔥 인기곡 TOP ${data.length} (${label})\n\n`;
  data.forEach((t, i) => {
    const medal = medals[i] || `${i + 1}.`;
    const likes = t.comm_likes || 0;
    const plays = t.comm_plays || 0;
    const title = (t.title || '무제').slice(0, 18);
    const owner = (t.owner_name || '익명').slice(0, 8);
    msg += `${medal} ${title}\n   ${owner} · ❤️${likes} ▶${plays}\n`;
  });
  msg += `\n⏰ ${ts()}`;

  return text(msg, ['순위', '플랫폼', '장르']);
};
COMMANDS['인기'] = COMMANDS['인기곡'];
COMMANDS['trending'] = COMMANDS['인기곡'];
COMMANDS['핫'] = COMMANDS['인기곡'];

/* 순위 — 크리에이터 랭킹 */
COMMANDS['순위'] = async () => {
  const { data } = await sb('GET', '/tracks?select=owner_name,comm_likes,comm_plays&limit=1000');
  if (!data.length) return text('트랙 데이터가 없습니다.', ['인기곡', '플랫폼']);

  const creators = {};
  data.forEach(t => {
    const name = t.owner_name || '익명';
    if (!creators[name]) creators[name] = { tracks: 0, likes: 0, plays: 0 };
    creators[name].tracks++;
    creators[name].likes += (t.comm_likes || 0);
    creators[name].plays += (t.comm_plays || 0);
  });

  const ranked = Object.entries(creators)
    .map(([name, s]) => ({ name, ...s, score: s.likes * 3 + s.plays }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const medals = ['🥇','🥈','🥉'];
  let msg = `👑 크리에이터 랭킹 TOP ${ranked.length}\n\n`;
  ranked.forEach((c, i) => {
    const medal = medals[i] || `${i + 1}.`;
    msg += `${medal} ${c.name.slice(0, 10)}\n   🎵${c.tracks} ❤️${c.likes} ▶${c.plays}\n`;
  });
  msg += `\n⏰ ${ts()}`;

  return text(msg, ['인기곡', '플랫폼']);
};
COMMANDS['랭킹'] = COMMANDS['순위'];
COMMANDS['ranking'] = COMMANDS['순위'];

/* 플랫폼 — 서비스 인사이트 */
COMMANDS['플랫폼'] = async () => {
  const { count: trackCount } = await sb('GET', '/tracks?select=id&limit=0');
  const { count: userCount } = await sb('GET', '/users?select=id&limit=0');

  let totalLikes = 0, totalPlays = 0;
  try {
    const { data: all } = await sb('GET', '/tracks?select=comm_likes,comm_plays&limit=5000');
    all.forEach(t => { totalLikes += (t.comm_likes || 0); totalPlays += (t.comm_plays || 0); });
  } catch {}

  const today = new Date().toISOString().split('T')[0];
  let todayTracks = 0, todayUsers = 0;
  try { todayTracks = (await sb('GET', `/tracks?created_at=gte.${today}&select=id&limit=500`)).data.length; } catch {}
  try { todayUsers = (await sb('GET', `/users?created_at=gte.${today}&select=id&limit=500`)).data.length; } catch {}

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  let weekTracks = 0;
  try { weekTracks = (await sb('GET', `/tracks?created_at=gte.${weekAgo}&select=id&limit=500`)).data.length; } catch {}

  const tc = trackCount ?? 0;
  const avgLikes = tc > 0 ? (totalLikes / tc).toFixed(1) : '0';

  let msg = `📊 서비스 인사이트\n\n`;
  msg += `🎵 총 트랙: ${tc}곡\n`;
  msg += `👥 총 사용자: ${userCount ?? '?'}명\n`;
  msg += `❤️ 총 좋아요: ${totalLikes}\n`;
  msg += `▶ 총 재생: ${totalPlays}\n\n`;
  msg += `📅 오늘: 트랙 +${todayTracks} / 유저 +${todayUsers}\n`;
  msg += `📆 이번 주: 트랙 +${weekTracks}\n`;
  msg += `📈 트랙당 평균 좋아요: ${avgLikes}\n\n`;
  msg += `⏰ ${ts()}`;

  return text(msg, ['인기곡', '순위', '장르']);
};
COMMANDS['인사이트'] = COMMANDS['플랫폼'];
COMMANDS['insight'] = COMMANDS['플랫폼'];

/* 장르 — 모드별 분석 */
COMMANDS['장르'] = async () => {
  const { data } = await sb('GET', '/tracks?select=gen_mode,comm_likes&limit=5000');
  if (!data.length) return text('트랙 데이터가 없습니다.', ['인기곡', '순위']);

  const modes = {};
  data.forEach(t => {
    const m = t.gen_mode || 'unknown';
    if (!modes[m]) modes[m] = { count: 0, likes: 0 };
    modes[m].count++;
    modes[m].likes += (t.comm_likes || 0);
  });

  const total = data.length;
  const sorted = Object.entries(modes).sort((a, b) => b[1].count - a[1].count);

  const modeNames = { simple: '🎹 심플', custom: '🎨 커스텀', extend: '🔄 연장', remix: '🎤 리믹스', unknown: '❓ 기타' };
  let msg = `🎼 모드별 분석 (총 ${total}곡)\n\n`;
  sorted.forEach(([mode, s]) => {
    const pct = ((s.count / total) * 100).toFixed(1);
    const barLen = Math.round(s.count / total * 10);
    const bar = '█'.repeat(barLen) + '░'.repeat(10 - barLen);
    const avgL = s.count > 0 ? (s.likes / s.count).toFixed(1) : '0';
    const label = modeNames[mode] || `🎵 ${mode}`;
    msg += `${label}\n${bar} ${pct}% (${s.count}곡) 평균❤️${avgL}\n`;
  });
  msg += `\n⏰ ${ts()}`;

  return text(msg, ['인기곡', '순위']);
};
COMMANDS['모드'] = COMMANDS['장르'];
COMMANDS['genre'] = COMMANDS['장르'];

/* ══════════════════════════════════
   🎵 음악 생성 명령 (커스텀/심플/유튜브/MV)
══════════════════════════════════ */

async function kieApi(method, path, body = null) {
  if (!KIE_API_KEY) throw new Error('KIE_API_KEY 미설정');
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KIE_API_KEY}` },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${KIE_BASE}${path}`, opts);
  const d = await r.json();
  if (!r.ok) throw new Error(d?.msg || d?.error || `kie.ai ${r.status}`);
  return d;
}

async function pollKie(taskId, maxPolls = 60) {
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, i < 3 ? 1000 : i < 10 ? 2000 : 3000));
    const data = await kieApi('GET', `/api/v1/generate/record-info?taskId=${taskId}`);
    const st = data?.data;
    if (!st) continue;
    const status = (st.status || '').toUpperCase();
    const tracks = st.response?.sunoData || st.sunoData || st.tracks || st.response?.tracks || [];
    if (status === 'SUCCESS' && tracks.length) return tracks;
    if (['FAILED', 'ERROR', 'TIMEOUT'].includes(status)) {
      throw new Error(st.response?.errorMessage || st.errorMessage || '생성 실패');
    }
  }
  throw new Error('타임아웃 — 다시 시도해주세요');
}

async function notifyResult(msg) {
  try {
    const payload = JSON.stringify({ text: msg, parse_mode: '' });
    const bytes = Buffer.from(payload, 'utf-8');
    await fetch(`${BASE}/api/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(bytes.length) },
      body: bytes,
    });
  } catch {}
  try {
    await fetch(`${BASE}/api/kakao-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: msg.slice(0, 300) }),
    });
  } catch {}
}

async function saveTrack(track, taskId, mode, tags) {
  try {
    await sb('POST', '/tracks', {
      id: track.id || `bot-${Date.now()}`,
      task_id: taskId,
      title: track.title || '무제',
      audio_url: track.audioUrl || track.audio_url || '',
      image_url: track.imageUrl || track.image_url || '',
      tags: tags || '',
      lyrics: track.lyric || track.lyrics || '',
      gen_mode: mode,
      owner_name: 'Bot',
      owner_avatar: '',
      owner_provider: 'bot',
      is_public: true,
    });
  } catch (e) { console.warn('[bot-save]', e.message); }
}

/* 비동기 생성 실행 (카카오 응답 후 백그라운드) */
function runGenerate(mode, prompt, style, options = {}) {
  const body = {
    prompt,
    customMode: mode === 'custom' || mode === 'youtube',
    instrumental: options.instrumental || false,
    model: 'V3_5',
    callBackUrl: CALLBACK,
  };
  if (style) body.style = style;
  if (options.title) body.title = options.title;
  if (options.negativeTags) body.negativeTags = options.negativeTags;

  /* fire-and-forget: 카카오 응답은 즉시 반환, 결과는 텔레그램+카카오로 알림 */
  (async () => {
    try {
      const genData = await kieApi('POST', '/api/v1/generate', body);
      const taskId = genData?.data?.taskId || genData?.taskId;
      if (!taskId) throw new Error('taskId 없음');

      const tracks = await pollKie(taskId);
      const t = tracks[0];
      const title = t?.title || options.title || '봇 생성곡';
      await saveTrack(t, taskId, mode, style || prompt);

      const modeNames = { custom: '커스텀', simple: '심플', youtube: '유튜브', mv: 'MV' };
      await notifyResult(
        `🎵 봇 음악 생성 완료!\n\n` +
        `🎧 ${title}\n` +
        `🎸 모드: ${modeNames[mode] || mode}\n` +
        `🏷 ${(style || prompt || '').slice(0, 80)}\n\n` +
        `🔗 ${BASE}`
      );
    } catch (e) {
      await notifyResult(`❌ 봇 생성 실패 (${mode})\n\n${e.message}\n\n프롬프트: ${prompt.slice(0, 100)}`);
    }
  })();
}

/* 커스텀 생성 */
COMMANDS['생성'] = COMMANDS['커스텀'] = COMMANDS['custom'] = async (arg) => {
  if (!arg) return card(
    '🎵 커스텀 생성',
    '사용법: 커스텀 <가사 또는 설명>\n\n예시:\n커스텀 새벽 감성 발라드\n커스텀 [Verse 1] 너를 만난 그날부터...\n\n옵션:\n· 스타일: | 뒤에 장르 추가\n  커스텀 가사내용 | K-Pop, 댄스',
    [{ label: '사이트에서 만들기', url: BASE }],
    ['심플', 'MV', '도움']
  );
  if (!KIE_API_KEY) return text('KIE_API_KEY 미설정');

  const [promptPart, stylePart] = arg.split('|').map(s => s.trim());
  runGenerate('custom', promptPart, stylePart || '');
  return card(
    '🎵 커스텀 생성 시작!',
    `📝 ${promptPart.slice(0, 80)}\n${stylePart ? '🎸 ' + stylePart : ''}\n\n⏳ 1~2분 후 결과가 텔레그램+카카오로 전송됩니다.`,
    [{ label: '사이트 열기', url: BASE }],
    ['상태', '트랙']
  );
};

/* 심플 생성 */
COMMANDS['심플'] = COMMANDS['simple'] = async (arg) => {
  if (!arg) return card(
    '✨ 심플 생성',
    '사용법: 심플 <곡 설명>\n\n예시:\n심플 비 오는 날 듣기 좋은 재즈\n심플 신나는 EDM 파티 음악\n심플 잔잔한 어쿠스틱 기타',
    [{ label: '사이트에서 만들기', url: BASE }],
    ['커스텀', 'MV', '도움']
  );
  if (!KIE_API_KEY) return text('KIE_API_KEY 미설정');

  runGenerate('simple', arg, arg);
  return card(
    '✨ 심플 생성 시작!',
    `📝 ${arg.slice(0, 100)}\n\n⏳ 1~2분 후 결과가 텔레그램+카카오로 전송됩니다.`,
    [{ label: '사이트 열기', url: BASE }],
    ['상태', '트랙']
  );
};

/* 유튜브 모드 (URL 없이 스타일로 생성) */
COMMANDS['유튜브'] = COMMANDS['youtube'] = COMMANDS['yt'] = async (arg) => {
  if (!arg) return card(
    '🎬 유튜브 스타일 생성',
    '사용법: 유튜브 <스타일 설명>\n\n예시:\n유튜브 lo-fi hip hop chill beats\n유튜브 cinematic epic orchestral\n유튜브 K-Pop 걸그룹 댄스',
    [{ label: '사이트에서 만들기', url: BASE }],
    ['커스텀', '심플', '도움']
  );
  if (!KIE_API_KEY) return text('KIE_API_KEY 미설정');

  runGenerate('youtube', arg, arg);
  return card(
    '🎬 유튜브 스타일 생성 시작!',
    `🎸 ${arg.slice(0, 100)}\n\n⏳ 1~2분 후 결과가 텔레그램+카카오로 전송됩니다.`,
    [{ label: '사이트 열기', url: BASE }],
    ['상태', '트랙']
  );
};

/* MV 생성 (기존 트랙 ID 필요) */
COMMANDS['mv'] = COMMANDS['MV'] = COMMANDS['뮤비'] = async (arg) => {
  if (!arg) return card(
    '🎬 MV 생성',
    '사용법: MV <트랙ID>\n\n최근 트랙 목록에서 ID를 확인하세요.\n\n예시:\nMV 1742612345678',
    [{ label: '사이트에서 만들기', url: BASE }],
    ['트랙', '커스텀', '도움']
  );
  if (!KIE_API_KEY) return text('KIE_API_KEY 미설정');

  /* 트랙 조회 */
  let track;
  try {
    const { data } = await sb('GET', `/tracks?id=eq.${arg}&select=id,title,audio_url,image_url,tags,lyrics&limit=1`);
    track = data?.[0];
  } catch {}
  if (!track) return text(`트랙 ID "${arg}"를 찾을 수 없습니다.\n\n"트랙" 명령으로 최근 곡 목록을 확인하세요.`, ['트랙']);

  /* MV 비동기 생성 */
  (async () => {
    try {
      const mvBody = {
        audioUrl: track.audio_url,
        title: track.title || '무제',
        lyrics: track.lyrics || '',
        imageUrl: track.image_url || '',
        callBackUrl: CALLBACK,
      };
      const genData = await kieApi('POST', '/api/v1/generate/mv', mvBody);
      const taskId = genData?.data?.taskId || genData?.taskId;
      if (!taskId) throw new Error('MV taskId 없음');

      /* MV 폴링 (더 오래 걸림) */
      const result = await pollKie(taskId, 90);
      const videoUrl = result[0]?.videoUrl || result[0]?.video_url || '';

      if (videoUrl) {
        await sb('PATCH', `/tracks?id=eq.${arg}`, { video_url: videoUrl });
        await notifyResult(
          `🎬 MV 생성 완료!\n\n` +
          `🎧 ${track.title}\n` +
          `🔗 ${BASE}`
        );
      } else {
        throw new Error('비디오 URL 없음');
      }
    } catch (e) {
      await notifyResult(`❌ MV 생성 실패\n\n${track.title}\n${e.message}`);
    }
  })();

  return card(
    '🎬 MV 생성 시작!',
    `🎧 ${track.title}\n\n⏳ 3~5분 후 결과가 텔레그램+카카오로 전송됩니다.`,
    [{ label: '사이트 열기', url: BASE }],
    ['상태', '트랙']
  );
};

/* ── Git 관리 ── */
COMMANDS['브랜치'] = COMMANDS['branch'] = COMMANDS['branches'] = async () => {
  const branches = await ghApi('GET', '/branches?per_page=30');
  if (!branches.length) return text('브랜치 없음');
  const lines = branches.map(b => (b.protected ? '🔒 ' : '  ') + b.name + (b.name === 'main' ? ' ⭐' : ''));
  return text('🔀 원격 브랜치 (' + branches.length + '개)\n\n' + lines.join('\n'), ['브랜치삭제', '커밋', '도움']);
};

COMMANDS['브랜치삭제'] = COMMANDS['delbranch'] = async (arg) => {
  if (!arg) return text('사용법: 브랜치삭제 <브랜치이름>');
  if (arg === 'main' || arg === 'master') return text('⛔ main/master는 삭제 불가');
  await ghApi('DELETE', '/git/refs/heads/' + arg);
  return text('✅ 브랜치 삭제 완료: ' + arg, ['브랜치']);
};

COMMANDS['이슈'] = COMMANDS['issues'] = COMMANDS['issue'] = async (arg) => {
  const state = (arg === 'closed' || arg === '닫힌') ? 'closed' : 'open';
  const issues = await ghApi('GET', '/issues?state=' + state + '&per_page=15&sort=updated&direction=desc');
  const real = issues.filter(i => !i.pull_request);
  if (!real.length) return text('📋 ' + state + ' 이슈 없음');
  const lines = real.map(i => {
    const labels = i.labels.map(l => l.name).join(',');
    return '#' + i.number + ' ' + i.title + (labels ? ' [' + labels + ']' : '');
  });
  return text('📋 이슈 (' + state + ', ' + real.length + '개)\n\n' + lines.join('\n'), ['이슈닫기', '이슈 closed', '도움']);
};

COMMANDS['이슈닫기'] = COMMANDS['closeissue'] = async (arg) => {
  if (!arg) return text('사용법: 이슈닫기 <번호>');
  const d = await ghApi('PATCH', '/issues/' + arg.replace('#', ''), { state: 'closed', state_reason: 'completed' });
  return text('✅ 이슈 #' + d.number + ' 닫기 완료: ' + d.title, ['이슈']);
};

COMMANDS['PR닫기'] = COMMANDS['pr닫기'] = COMMANDS['closepr'] = async (arg) => {
  if (!arg) return text('사용법: PR닫기 <번호>');
  const pr = await ghApi('PATCH', '/pulls/' + arg.replace('#', ''), { state: 'closed' });
  let msg = '✅ PR #' + pr.number + ' 닫기 완료: ' + pr.title;
  const branch = pr.head?.ref;
  if (branch && branch !== 'main') {
    try { await ghApi('DELETE', '/git/refs/heads/' + branch); msg += '\n🗑 브랜치 삭제: ' + branch; } catch(e) {}
  }
  return text(msg, ['PR', '브랜치']);
};

COMMANDS['커밋'] = COMMANDS['commits'] = async (arg) => {
  const n = Math.min(parseInt(arg) || 10, 20);
  const commits = await ghApi('GET', '/commits?per_page=' + n);
  if (!commits.length) return text('커밋 없음');
  const lines = commits.map(c => {
    const sha = c.sha.slice(0, 7);
    const msg = (c.commit.message || '').split('\n')[0].slice(0, 50);
    const date = new Date(c.commit.author?.date).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return sha + ' ' + msg + ' (' + date + ')';
  });
  return text('📝 최근 커밋 (' + commits.length + '개)\n\n' + lines.join('\n'), ['브랜치', '도움']);
};

/* ── mc — 프로젝트 MD 파일 조회 ── */
COMMANDS['mc'] = COMMANDS['md'] = COMMANDS['문서'] = async (arg) => {
  const KNOWN = {
    'claude': 'CLAUDE.md', 'readme': 'README.md', 'api': 'KIE_API_REFERENCE.md',
    'kie': 'KIE_API_REFERENCE.md', 'bot': 'docs/TELEGRAM_BOT.md',
    'roadmap': 'docs/ROADMAP.md', 'plan': 'docs/WORK_PLAN.md',
    'policy': 'docs/POLICY.md', 'cicd': 'docs/CI_CD_PIPELINE.md',
    'flutter': 'docs/FLUTTER_APP.md', 'architecture': 'docs/API_ARCHITECTURE.md',
    'sequence': 'docs/SEQUENCE_DIAGRAM.md', 'tab': 'docs/tab-structure.md',
    'zindex': 'docs/z-index-layers.md', 'community': 'docs/community-layout.md',
    'storyboard': 'docs/STORYBOARD.md', 'changelog': 'docs/changelog-20260322.md',
  };
  if (!arg) {
    const list = Object.entries(KNOWN).map(([k, v]) => k + ' → ' + v).join('\n');
    return text('📄 프로젝트 문서 조회\n\n사용법: mc <파일명>\n\n' + list, ['mc claude', 'mc bot', '도움']);
  }
  const key = arg.toLowerCase().replace(/\.md$/i, '').replace(/\//g, '');
  let filePath = KNOWN[key] || arg;
  if (!filePath.endsWith('.md')) filePath += '.md';

  const _ghHeaders = GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github.raw' } : {};
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${encodeURIComponent(filePath)}?ref=main`, { headers: _ghHeaders });
  if (!r.ok) throw new Error('파일 없음: ' + filePath);
  let content = await r.text();
  /* 카카오 1000자 제한 */
  if (content.length > 950) content = content.slice(0, 950) + '\n\n... (이하 생략)';
  return text('📄 ' + filePath + '\n\n' + content, ['mc', '도움']);
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
      { re: /노래.*(만들|생성|하나)|음악.*(만들|생성|하나)|곡.*(만들|생성|하나)/i, cmd: '심플' },
      { re: /뮤비.*(만들|생성)|MV.*(만들|생성)/i, cmd: 'MV' },
      { re: /진행.*(어때|어디|상황|상태|됐|됨|완료|얼마)|어디.*까지|다\s*됐|끝났|작업.*추적/i, cmd: '진행상황' },
      { re: /PR.*(있|목록|확인|열린|리스트)|풀리퀘/i, cmd: 'PR' },
      { re: /머지.*(해|하자|ㄱ|go)|합쳐/i, cmd: '머지' },
      { re: /서버.*(상태|어때|정상)|사이트.*(되|살아|정상)|헬스/i, cmd: '상태' },
      { re: /QA|점검|테스트.*전체|버그.*찾/i, cmd: 'QA' },
      { re: /kie.*api|api.*문서|레퍼런스|음악.*api|가사.*api/i, cmd: 'kie' },
      { re: /작업|구현|현황|뭐.*했|뭐.*만들|어디.*까지.*구현|기능.*목록/i, cmd: '작업' },
      { re: /고도화|phase|업그레이드.*진행/i, cmd: '고도화' },
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
