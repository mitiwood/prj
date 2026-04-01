/**
 * /api/gh-webhook — GitHub Webhook 수신 (workflow_run 이벤트)
 * Actions 상태 변경 시 텔레그램으로 실시간 알림
 */
import crypto from 'crypto';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || '').trim();
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const GH_TOKEN = process.env.GITHUB_TOKEN || '';
const GH_REPO = 'mitiwood/ai-music-studio';

async function tgSend(text, keyboard) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  const payload = { chat_id: CHAT_ID, text };
  if (keyboard) payload.reply_markup = keyboard;
  const body = Buffer.from(JSON.stringify(payload), 'utf-8');
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(body.length) },
      body,
    });
  } catch (e) { console.warn('[gh-webhook] tgSend:', e.message); }
}

function verifySignature(req) {
  const sig = req.headers['x-hub-signature-256'] || '';
  if (!sig || !ADMIN_SECRET) return false;
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const expected = 'sha256=' + crypto.createHmac('sha256', ADMIN_SECRET).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch { return false; }
}

async function ghApi(method, path) {
  if (!GH_TOKEN) return null;
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}${path}`, {
    method,
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'kms-bot' },
  });
  if (!r.ok) return null;
  return r.json();
}

async function classifyFailure(runId) {
  try {
    const data = await ghApi('GET', `/actions/runs/${runId}/jobs`);
    const jobs = data?.jobs || [];
    const failedJob = jobs.find(j => j.conclusion === 'failure');
    if (!failedJob) return { type: 'UNKNOWN', msg: '알 수 없는 오류' };

    const failedStep = failedJob.steps?.find(s => s.conclusion === 'failure');
    const name = failedStep?.name || '';

    if (name.includes('secret') || name.includes('Validate')) return { type: 'TOKEN_EXPIRED', msg: '시크릿 키 만료 또는 미설정' };
    if (name.includes('Claude') || name.includes('claude')) return { type: 'CLAUDE_ERROR', msg: 'Claude Code 실행 오류' };
    if (name.includes('Push') || name.includes('push') || name.includes('commit')) return { type: 'PUSH_FAILED', msg: 'Git 푸시 실패 (충돌 가능)' };
    if (name.includes('Install') || name.includes('Setup')) return { type: 'SETUP_FAILED', msg: '환경 설정 실패' };

    return { type: 'STEP_FAILED', msg: name + ' 단계 실패' };
  } catch (e) {
    return { type: 'UNKNOWN', msg: e.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Hub-Signature-256,X-GitHub-Event');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  /* 서명 검증 (ADMIN_SECRET을 webhook secret으로 사용) */
  if (ADMIN_SECRET && !verifySignature(req)) {
    console.warn('[gh-webhook] signature mismatch');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.headers['x-github-event'];
  const payload = req.body;

  /* workflow_run 이벤트만 처리 */
  if (event === 'workflow_run') {
    const run = payload.workflow_run;
    const action = payload.action; /* requested, in_progress, completed */
    const name = run?.name || '';
    const conclusion = run?.conclusion || '';
    const runUrl = run?.html_url || '';

    /* Claude Code Auto-Fix 워크플로우만 필터링 */
    if (!name.includes('Claude') && !name.includes('claude') && !name.includes('Auto-Fix') && !name.includes('auto-fix')) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    /* 관련 Issue 번호 추출 */
    const issueMatch = (run?.head_commit?.message || '').match(/#(\d+)/);
    const issueNum = issueMatch ? issueMatch[1] : '';

    if (action === 'requested') {
      await tgSend('🔄 코드 수정 작업이 대기열에 들어갔어요\n\n📋 ' + (name || 'Auto-Fix') + (issueNum ? ' #' + issueNum : '') + '\n⏳ 곧 시작됩니다...');
    }

    if (action === 'in_progress') {
      await tgSend('🔍 코드 분석 및 수정 중...\n\n📋 ' + (name || 'Auto-Fix') + (issueNum ? ' #' + issueNum : '') + '\n🤖 Claude가 코드를 수정하고 있어요');
    }

    if (action === 'completed') {
      if (conclusion === 'success') {
        await tgSend(
          '✅ 코드 수정 완료!\n\n📋 ' + (name || 'Auto-Fix') + (issueNum ? ' #' + issueNum : '') + '\n🚀 Vercel 배포 시작됩니다\n🔗 https://ddinggok.com',
          { inline_keyboard: [[{ text: '🌐 사이트 확인', url: 'https://ddinggok.com' }, { text: '📋 Actions 로그', url: runUrl }]] }
        );
      } else if (conclusion === 'failure') {
        const failure = await classifyFailure(run.id);
        await tgSend(
          '❌ 코드 수정 실패\n\n📋 ' + (name || 'Auto-Fix') + (issueNum ? ' #' + issueNum : '') + '\n⚠️ ' + failure.msg + ' (' + failure.type + ')',
          { inline_keyboard: [
            [{ text: '🔄 재시도', callback_data: 'retry:' + (issueNum || '0') }, { text: '❌ 취소', callback_data: 'cancel:' + (issueNum || '0') }],
            [{ text: '📋 로그 보기', url: runUrl }],
          ] }
        );
      } else if (conclusion === 'cancelled') {
        await tgSend('⏹ 코드 수정이 취소되었어요\n\n📋 ' + (name || 'Auto-Fix') + (issueNum ? ' #' + issueNum : ''));
      }
    }

    return res.status(200).json({ ok: true, action, conclusion });
  }

  /* 다른 이벤트는 무시 */
  return res.status(200).json({ ok: true, event, skipped: true });
}
