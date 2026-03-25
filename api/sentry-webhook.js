/**
 * /api/sentry-webhook — Sentry 웹훅 수신 → 크리티컬 에러 봇 알림
 *
 * Sentry Webhook Integration에서 이 URL을 등록:
 *   https://ai-music-studio-bice.vercel.app/api/sentry-webhook
 *
 * 트리거 조건: issue.created (새 이슈 생성 시)
 * 크리티컬/에러 레벨만 알림 전송 (warning/info 무시)
 */

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const BASE = 'https://ai-music-studio-bice.vercel.app';

/* 도배 방지: 같은 이슈 10분 내 재전송 차단 */
const _sentCache = {};
const COOLDOWN = 600000; /* 10분 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const payload = req.body || {};

    /* Sentry webhook payload 파싱 */
    const action = payload.action || '';
    const data = payload.data || {};
    const issue = data.issue || payload.event || {};

    const issueId = issue.id || issue.event_id || '';
    const title = issue.title || issue.message || '알 수 없는 에러';
    const level = (issue.level || issue.tags?.level || 'error').toLowerCase();
    const culprit = issue.culprit || issue.transaction || '';
    const url = issue.permalink || (issue.id ? `https://sentry.io/issues/${issue.id}/` : '');
    const count = issue.count || 1;
    const firstSeen = issue.firstSeen || '';
    const metadata = issue.metadata || {};
    const errorType = metadata.type || '';
    const errorValue = (metadata.value || '').slice(0, 200);

    /* warning/info 레벨은 무시 */
    if (level === 'warning' || level === 'info' || level === 'debug') {
      return res.status(200).json({ ok: true, skipped: true, reason: 'non-critical level' });
    }

    /* 도배 방지 */
    const cacheKey = String(issueId || title).slice(0, 100);
    if (_sentCache[cacheKey] && Date.now() - _sentCache[cacheKey] < COOLDOWN) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'cooldown' });
    }
    _sentCache[cacheKey] = Date.now();

    /* 오래된 캐시 정리 */
    const now = Date.now();
    Object.keys(_sentCache).forEach(k => { if (now - _sentCache[k] > COOLDOWN * 3) delete _sentCache[k]; });

    /* 크리티컬 여부 판별 */
    const isCritical = level === 'fatal' || level === 'critical' || count >= 10;
    const emoji = isCritical ? '🔴' : '🟡';
    const severity = isCritical ? 'CRITICAL' : 'ERROR';

    /* 텔레그램 메시지 (HTML) */
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const tgText = [
      `${emoji} <b>Sentry ${severity}</b>`,
      ``,
      `<b>제목:</b> ${esc(title.slice(0, 120))}`,
      errorType ? `<b>타입:</b> ${esc(errorType)}` : '',
      errorValue ? `<b>내용:</b> ${esc(errorValue)}` : '',
      culprit ? `<b>위치:</b> ${esc(culprit.slice(0, 80))}` : '',
      `<b>레벨:</b> ${level} · <b>발생:</b> ${count}회`,
      firstSeen ? `<b>최초:</b> ${new Date(firstSeen).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}` : '',
      url ? `\n🔗 ${esc(url)}` : '',
    ].filter(Boolean).join('\n');

    const keyboard = url ? { inline_keyboard: [[{ text: '🔍 Sentry에서 보기', url }]] } : undefined;

    /* 텔레그램 + 카카오 동시 전송 */
    const kakaoText = `${emoji} Sentry ${severity}\n\n${title.slice(0, 100)}\n${errorType ? errorType + ': ' : ''}${errorValue.slice(0, 100)}\n${culprit ? '위치: ' + culprit.slice(0, 60) : ''}\n레벨: ${level} · ${count}회 발생${url ? '\n' + url : ''}`.slice(0, 300);

    await Promise.allSettled([
      fetch(`${BASE}/api/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
        body: JSON.stringify({ text: tgText, parse_mode: 'HTML', reply_markup: keyboard }),
      }),
      fetch(`${BASE}/api/kakao-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: kakaoText }),
      }),
    ]);

    return res.status(200).json({ ok: true, severity, title: title.slice(0, 80) });
  } catch (e) {
    console.error('[sentry-webhook]', e.message);
    return res.status(200).json({ ok: false, error: e.message });
  }
}
