/**
 * /api/kakao-webhook — 카카오 오픈빌더 스킬서버
 *
 * POST → 오픈빌더 스킬 요청 수신 → 명령 처리 → JSON 응답
 *
 * 지원 명령 (텔레그램 봇과 동일):
 *   상태, 트랙, 유저, 댓글, 배포, 공지, 공지삭제,
 *   삭제, 공개, 비공개, 댓글삭제, 알림,
 *   수정, PR, 머지, 도움
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

function simpleText(text) {
  return {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text: text.slice(0, 1000) } }],
    },
  };
}

function textWithQuickReplies(text, buttons) {
  return {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text: text.slice(0, 1000) } }],
      quickReplies: buttons.map(b => ({
        label: b,
        action: 'message',
        messageText: b,
      })),
    },
  };
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

/* ── 명령 처리 ── */
const COMMANDS = {};

/* 도움 */
COMMANDS['도움'] = COMMANDS['help'] = async () => {
  return textWithQuickReplies(
    `🤖 Kenny Music Studio 봇 명령어

📊 모니터링
상태 — 서버 상태 리포트
트랙 — 최근 트랙 10곡
유저 — 유저 통계
댓글 — 최근 댓글 10개
배포 — 사이트 접근 확인

📝 관리
공지 <내용> — 공지사항 등록
공지삭제 — 공지사항 삭제
삭제 <트랙ID> — 트랙 삭제
공개/비공개 <트랙ID> — 트랙 공개/비공개
댓글삭제 <댓글ID> — 댓글 삭제

📣 알림
알림 <메시지> — 전체 푸시 발송

🛠 코드 수정
수정 <지시사항> — AI가 코드 수정 후 PR 생성
PR — 최근 PR 목록 확인
머지 <PR번호> — PR 머지 (배포)

⏰ ${ts()}`,
    ['상태', '트랙', '유저', '댓글', 'PR']
  );
};

/* 상태 */
COMMANDS['상태'] = COMMANDS['status'] = async () => {
  let report = `📊 서버 상태 리포트\n⏰ ${ts()}\n\n`;
  try {
    const { count: trackCount } = await sb('GET', '/tracks?select=id&limit=0');
    const { count: publicCount } = await sb('GET', '/tracks?is_public=eq.true&select=id&limit=0');
    report += `🎵 전체 트랙: ${trackCount ?? '?'}곡 (공개: ${publicCount ?? '?'})\n`;

    try {
      const { count: userCount } = await sb('GET', '/users?select=id&limit=0');
      report += `👥 사용자: ${userCount ?? '?'}명\n`;
    } catch {}

    try {
      const { count: commentCount } = await sb('GET', '/comments?select=id&limit=0');
      report += `💬 댓글: ${commentCount ?? '?'}개\n`;
    } catch {}

    const since1h = new Date(Date.now() - 3600000).toISOString();
    try {
      const { data: recent } = await sb('GET', `/tracks?created_at=gte.${since1h}&select=id&limit=100`);
      report += `\n🕐 최근 1시간: 신규 ${recent.length}곡\n`;
    } catch {}

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
  return simpleText(report);
};

/* 트랙 */
COMMANDS['트랙'] = COMMANDS['tracks'] = async (arg) => {
  const limit = parseInt(arg) || 10;
  const { data } = await sb('GET', `/tracks?order=created_at.desc&select=id,title,owner_name,gen_mode,comm_likes,is_public,created_at&limit=${Math.min(limit, 20)}`);
  if (!data.length) return simpleText('📭 트랙이 없습니다.');

  let msg = `🎵 최근 트랙 (${data.length}곡)\n\n`;
  data.forEach((t, i) => {
    const time = new Date(t.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit' });
    const pub = t.is_public !== false ? '🌐' : '🔒';
    const likes = t.comm_likes ? ` ❤️${t.comm_likes}` : '';
    msg += `${i + 1}. ${pub} ${t.title || '무제'}${likes}\n   ${t.owner_name || '익명'} · ${t.gen_mode || '?'} · ${time}\n\n`;
  });
  return simpleText(msg);
};

/* 유저 */
COMMANDS['유저'] = COMMANDS['users'] = async () => {
  const { data, count } = await sb('GET', '/users?select=id,name,provider,created_at&order=created_at.desc&limit=10');
  let msg = `👥 유저 현황 (총 ${count ?? data.length}명)\n\n`;
  data.forEach((u, i) => {
    const time = new Date(u.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const icon = { google: '🔵', kakao: '💬', naver: '🟢' }[u.provider] || '👤';
    msg += `${i + 1}. ${icon} ${u.name || '?'} (${u.provider || '?'}) ${time}\n`;
  });
  return simpleText(msg);
};

/* 댓글 */
COMMANDS['댓글'] = COMMANDS['comments'] = async (arg) => {
  let path = '/comments?order=created_at.desc&select=id,track_id,author_name,content,created_at&limit=10';
  if (arg) path = `/comments?track_id=eq.${arg}&order=created_at.desc&select=id,track_id,author_name,content,created_at&limit=20`;
  const { data } = await sb('GET', path);
  if (!data.length) return simpleText('💬 댓글이 없습니다.');
  let msg = `💬 최근 댓글 (${data.length}개)\n\n`;
  data.forEach((c, i) => {
    const time = new Date(c.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
    const preview = (c.content || '').slice(0, 50) + ((c.content || '').length > 50 ? '...' : '');
    msg += `${i + 1}. ${c.author_name || '익명'}: ${preview}\n   ${time}\n\n`;
  });
  return simpleText(msg);
};

/* 공지 */
COMMANDS['공지'] = COMMANDS['announce'] = async (arg) => {
  if (!arg) return simpleText('⚠️ 사용법: 공지 <내용>');
  try {
    const r = await fetch(`${BASE}/api/announcement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
      body: JSON.stringify({ text: arg, type: 'info' }),
    });
    const d = await r.json();
    if (d.ok || d.success) return simpleText(`✅ 공지 등록 완료!\n\n📢 ${arg}`);
    return simpleText(`❌ 공지 등록 실패: ${d.error || '알 수 없는 오류'}`);
  } catch (e) {
    return simpleText(`❌ 오류: ${e.message}`);
  }
};

/* 공지삭제 */
COMMANDS['공지삭제'] = async () => {
  try {
    const r = await fetch(`${BASE}/api/announcement`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ADMIN_SECRET}` },
    });
    const d = await r.json();
    return simpleText(d.ok || d.success ? '✅ 공지 삭제 완료' : `❌ ${d.error || '실패'}`);
  } catch (e) {
    return simpleText(`❌ 오류: ${e.message}`);
  }
};

/* 삭제 */
COMMANDS['삭제'] = COMMANDS['delete'] = async (arg) => {
  if (!arg) return simpleText('⚠️ 사용법: 삭제 <트랙ID>');
  try {
    const r = await fetch(`${BASE}/api/tracks?id=${encodeURIComponent(arg)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ADMIN_SECRET}` },
    });
    const d = await r.json();
    return simpleText(d.success !== false ? `✅ 트랙 삭제 완료: ${arg}` : `❌ ${d.error || '삭제 실패'}`);
  } catch (e) {
    return simpleText(`❌ 오류: ${e.message}`);
  }
};

/* 공개 */
COMMANDS['공개'] = async (arg) => {
  if (!arg) return simpleText('⚠️ 사용법: 공개 <트랙ID>');
  try {
    await sb('PATCH', `/tracks?id=eq.${arg}`, { is_public: true });
    return simpleText(`✅ 트랙 공개 전환: ${arg}`);
  } catch (e) {
    return simpleText(`❌ 오류: ${e.message}`);
  }
};

/* 비공개 */
COMMANDS['비공개'] = async (arg) => {
  if (!arg) return simpleText('⚠️ 사용법: 비공개 <트랙ID>');
  try {
    await sb('PATCH', `/tracks?id=eq.${arg}`, { is_public: false });
    return simpleText(`✅ 트랙 비공개 전환: ${arg}`);
  } catch (e) {
    return simpleText(`❌ 오류: ${e.message}`);
  }
};

/* 댓글삭제 */
COMMANDS['댓글삭제'] = async (arg) => {
  if (!arg) return simpleText('⚠️ 사용법: 댓글삭제 <댓글ID>');
  try {
    await sb('DELETE', `/comments?id=eq.${arg}`, null);
    return simpleText(`✅ 댓글 삭제 완료: ${arg}`);
  } catch (e) {
    return simpleText(`❌ 오류: ${e.message}`);
  }
};

/* 배포 */
COMMANDS['배포'] = COMMANDS['deploy'] = async () => {
  try {
    const t0 = Date.now();
    const r = await fetch(BASE);
    const ms = Date.now() - t0;
    const ok = r.status >= 200 && r.status < 400;
    return simpleText(ok
      ? `✅ 사이트 정상\nHTTP ${r.status} · ${ms}ms\n🔗 ${BASE}`
      : `⚠️ 사이트 이상\nHTTP ${r.status} · ${ms}ms`);
  } catch (e) {
    return simpleText(`❌ 사이트 접근 불가: ${e.message}`);
  }
};

/* 알림 */
COMMANDS['알림'] = COMMANDS['push'] = async (arg) => {
  if (!arg) return simpleText('⚠️ 사용법: 알림 <메시지>');
  try {
    const r = await fetch(`${BASE}/api/push-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
      body: JSON.stringify({ title: 'Kenny Music Studio', body: arg }),
    });
    const d = await r.json();
    return simpleText(`📣 푸시 발송 완료\n\n메시지: ${arg}\n전송: ${d.sent ?? 0}/${d.total ?? '?'}`);
  } catch (e) {
    return simpleText(`❌ 오류: ${e.message}`);
  }
};

/* 수정 — GitHub Issue 생성 → Claude Code Action */
COMMANDS['수정'] = COMMANDS['fix'] = COMMANDS['edit'] = async (arg) => {
  if (!arg) return simpleText('⚠️ 사용법: 수정 <지시사항>\n\n예시:\n수정 로그인 버튼 색상을 파란색으로\n수정 커뮤니티 탭 로딩 속도 개선');
  if (!GH_TOKEN) return simpleText('⚠️ GITHUB_TOKEN 환경변수가 설정되지 않았어요.');

  try {
    const issue = await ghApi('POST', '/issues', {
      title: `[카카오] ${arg.slice(0, 60)}`,
      body: `## 수정 요청\n\n${arg}\n\n---\n> 카카오톡 봇에서 요청됨 · ${ts()}`,
      labels: ['claude-fix'],
    });

    return textWithQuickReplies(
      `✅ 수정 요청 등록 완료!\n\n📋 Issue #${issue.number}\n📝 ${arg}\n\n🤖 Claude Code가 자동으로 코드를 수정하고 PR을 생성합니다.\n완료되면 알림이 올 거예요.\n\n🔗 ${issue.html_url}`,
      ['PR', '상태']
    );
  } catch (e) {
    return simpleText(`❌ Issue 생성 오류: ${e.message}`);
  }
};

/* PR */
COMMANDS['pr'] = COMMANDS['PR'] = async () => {
  if (!GH_TOKEN) return simpleText('⚠️ GITHUB_TOKEN 미설정');
  try {
    const prs = await ghApi('GET', '/pulls?state=open&sort=created&direction=desc&per_page=10');
    if (!prs.length) return simpleText('📭 열린 PR이 없습니다.');

    let msg = `🔀 열린 PR (${prs.length}개)\n\n`;
    prs.forEach((pr, i) => {
      const time = new Date(pr.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      msg += `${i + 1}. #${pr.number} ${pr.title}\n   ${pr.user?.login || '?'} · ${time}\n   → "머지 ${pr.number}" 으로 머지\n\n`;
    });
    return simpleText(msg);
  } catch (e) {
    return simpleText(`❌ PR 조회 실패: ${e.message}`);
  }
};

/* 머지 */
COMMANDS['머지'] = COMMANDS['merge'] = async (arg) => {
  if (!arg) return simpleText('⚠️ 사용법: 머지 <PR번호>');
  if (!GH_TOKEN) return simpleText('⚠️ GITHUB_TOKEN 미설정');
  const prNum = parseInt(arg);
  if (!prNum) return simpleText('⚠️ PR 번호를 숫자로 입력해주세요.');

  try {
    const pr = await ghApi('GET', `/pulls/${prNum}`);
    if (pr.state !== 'open') return simpleText(`⚠️ PR #${prNum}은 이미 ${pr.merged ? '머지됨' : '닫힘'} 상태입니다.`);

    const result = await ghApi('PUT', `/pulls/${prNum}/merge`, {
      merge_method: 'squash',
      commit_title: pr.title,
    });

    if (result.merged) {
      return textWithQuickReplies(
        `✅ PR #${prNum} 머지 완료!\n\n📝 ${pr.title}\n🚀 Vercel 자동 배포가 시작됩니다.\n약 30초 후 사이트에 반영됩니다.\n\n🔗 ${BASE}`,
        ['배포', '상태']
      );
    }
    return simpleText(`⚠️ 머지 실패: ${result.message || '알 수 없는 오류'}`);
  } catch (e) {
    return simpleText(`❌ 머지 오류: ${e.message}`);
  }
};

/* ── 메인 핸들러 ── */
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    return res.status(200).json(simpleText('카카오톡 봇 스킬서버입니다. "도움"을 입력하세요.'));
  }

  try {
    const body = req.body || {};
    const utterance = (body.userRequest?.utterance || '').trim();
    const userId = body.userRequest?.user?.id || '';

    if (!utterance) {
      return res.status(200).json(simpleText('메시지를 입력해주세요. "도움"을 입력하면 명령어 목록을 볼 수 있어요.'));
    }

    console.log(`[Kakao CMD] user=${userId.slice(0, 10)} text=${utterance}`);

    /* 명령 파싱 */
    const parts = utterance.replace(/^\//, '').split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ').trim();

    const handler = COMMANDS[cmd];
    if (handler) {
      try {
        const result = await handler(arg);
        return res.status(200).json(result);
      } catch (e) {
        console.error('[Kakao CMD error]', cmd, e.message);
        return res.status(200).json(simpleText(`❌ 명령 실행 오류: ${e.message}`));
      }
    }

    /* 알 수 없는 명령 */
    return res.status(200).json(
      textWithQuickReplies(
        `❓ 알 수 없는 명령: "${cmd}"\n"도움"을 입력하면 명령어 목록을 볼 수 있어요.`,
        ['도움', '상태', '트랙']
      )
    );
  } catch (e) {
    console.error('[Kakao webhook error]', e);
    return res.status(200).json(simpleText(`❌ 시스템 오류: ${e.message}`));
  }
}
