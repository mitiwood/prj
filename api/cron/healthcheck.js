/**
 * /api/cron/healthcheck — 매일 오전 9시(KST) 외부 연동 전체 점검 + 텔레그램 리포트
 * Vercel Cron: "0 0 * * *" (UTC 00:00 = KST 09:00)
 */

const SB_URL    = process.env.SUPABASE_URL;
const SB_KEY    = process.env.SUPABASE_SERVICE_KEY;
const TG_TOKEN  = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT   = (process.env.TELEGRAM_CHAT_ID || "").trim();
const KIE_KEY   = (process.env.KIE_API_KEY || "").trim();
const ANTHROPIC = process.env.ANTHROPIC_API_KEY || "";
const VAPID_PUB = process.env.VAPID_PUBLIC_KEY || "";
const TOSS_CK   = process.env.TOSS_CLIENT_KEY || "";
const TOSS_SK   = process.env.TOSS_SECRET_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || process.env.ADMIN_SECRET || "kenny2024!";
const BASE = "https://ai-music-studio-bice.vercel.app";

/* ── 유틸 ── */
async function probe(url, opts = {}) {
  const t0 = Date.now();
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), opts.timeout || 8000);
  try {
    const r = await fetch(url, { method: opts.method || "GET", signal: ac.signal, headers: opts.headers || {} });
    clearTimeout(tm);
    const ms = Date.now() - t0;
    let body = null;
    try { body = await r.text(); } catch {}
    return { ok: r.status >= 200 && r.status < 500, status: r.status, ms, body: (body || "").slice(0, 200) };
  } catch (e) {
    clearTimeout(tm);
    return { ok: false, status: "ERR", ms: Date.now() - t0, error: e.message };
  }
}

async function tgSend(text) {
  if (!TG_TOKEN || !TG_CHAT) return false;
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), 8000);
  try {
    const buf = Buffer.from(JSON.stringify({ chat_id: TG_CHAT, text,  }), "utf-8");
    const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST", signal: ac.signal,
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": String(buf.length) },
      body: buf,
    });
    const d = await r.json();
    return d.ok;
  } catch { return false; }
  finally { clearTimeout(tm); }
}

/* ── 메인 핸들러 ── */
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const cronAuth = req.headers["authorization"]?.replace("Bearer ", "");
  const vercelCron = req.headers["x-vercel-cron"];
  if (!vercelCron && cronAuth !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!TG_TOKEN || !TG_CHAT) {
    return res.status(400).json({ error: "텔레그램 봇 미설정" });
  }

  const ts = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const checks = [];
  let dbStats = {};

  /* ═══ 1. Supabase DB ═══ */
  const sbResult = await probe(
    `${SB_URL}/rest/v1/tracks?select=id&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Accept: "application/json" } }
  );
  checks.push({ name: "Supabase DB", ...sbResult });

  /* DB 통계 (Supabase 정상일 때만) — HEAD + Content-Range 카운트 */
  if (sbResult.ok) {
    const sbH = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Accept: "application/json", Prefer: "count=exact" };
    async function sbCount(table) {
      try {
        const ac = new AbortController();
        const tm = setTimeout(() => ac.abort(), 6000);
        const r = await fetch(`${SB_URL}/rest/v1/${table}?select=id&limit=0`, { signal: ac.signal, headers: sbH });
        clearTimeout(tm);
        const range = r.headers.get("content-range") || "";
        const m = range.match(/\/(\d+)/);
        return m ? parseInt(m[1]) : "?";
      } catch { return "?"; }
    }
    const [tc, uc, cc] = await Promise.all([sbCount("tracks"), sbCount("users"), sbCount("comments")]);
    dbStats = { tracks: tc, users: uc, comments: cc };
  }

  /* ═══ 2. KIE.ai (음악생성) ═══ */
  const kieResult = await probe(`${BASE}/api/config`);
  let kieKeyOk = false;
  if (kieResult.ok) {
    try { kieKeyOk = !!JSON.parse(kieResult.body).apiKey; } catch {}
  }
  checks.push({ name: "KIE.ai API", ok: kieResult.ok && kieKeyOk, status: kieResult.status, ms: kieResult.ms });

  /* ═══ 3. OAuth (Google/Kakao/Naver) ═══ */
  const [google, kakao, naver] = await Promise.all([
    probe(`${BASE}/api/auth/google`, { timeout: 5000 }),
    probe(`${BASE}/api/auth/kakao`, { timeout: 5000 }),
    probe(`${BASE}/api/auth/naver`, { timeout: 5000 }),
  ]);
  /* OAuth 리다이렉트(307/302) 또는 200(내부 fetch가 따라감) 모두 정상 */
  checks.push({ name: "Google OAuth", ok: google.ok, status: google.status, ms: google.ms });
  checks.push({ name: "Kakao OAuth", ok: kakao.ok, status: kakao.status, ms: kakao.ms });
  checks.push({ name: "Naver OAuth", ok: naver.ok, status: naver.status, ms: naver.ms });

  /* ═══ 4. Telegram Bot ═══ */
  const tgResult = await probe(`https://api.telegram.org/bot${TG_TOKEN}/getMe`);
  checks.push({ name: "Telegram Bot", ...tgResult });

  /* ═══ 5. VAPID (Push) ═══ */
  const vapidResult = await probe(`${BASE}/api/vapid-keys`);
  let vapidOk = false;
  if (vapidResult.ok) {
    try { vapidOk = !!JSON.parse(vapidResult.body).publicKey; } catch {}
  }
  checks.push({ name: "VAPID Push", ok: vapidResult.ok && vapidOk, status: vapidResult.status, ms: vapidResult.ms });

  /* ═══ 6. Toss Payments ═══ */
  const tossResult = await probe(`${BASE}/api/toss-config`);
  let tossMode = "?";
  if (tossResult.ok) {
    try {
      const ck = JSON.parse(tossResult.body).clientKey || "";
      tossMode = ck.startsWith("test_") ? "테스트" : "실서비스";
    } catch {}
  }
  checks.push({ name: "Toss Payments", ...tossResult, note: tossMode });

  /* ═══ 7. Claude API ═══ */
  checks.push({ name: "Claude API", ok: !!ANTHROPIC, status: ANTHROPIC ? "KEY설정됨" : "미설정", ms: 0 });

  /* ═══ 8. 사이트 접근 ═══ */
  const siteResult = await probe(BASE, { timeout: 10000 });
  checks.push({ name: "사이트 접근", ...siteResult });

  /* ═══ 리포트 생성 ═══ */
  const okCount = checks.filter(c => c.ok).length;
  const total = checks.length;
  const allOk = okCount === total;

  let report = `🏥 *일일 시스템 점검 리포트*\n📅 ${ts}\n\n`;

  /* 서비스 상태 */
  for (const c of checks) {
    const icon = c.ok ? "✅" : "❌";
    const ms = c.ms ? ` (${c.ms}ms)` : "";
    const note = c.note ? ` [${c.note}]` : "";
    report += `${icon} ${c.name} — ${c.status}${ms}${note}\n`;
  }

  /* DB 통계 */
  if (sbResult.ok && dbStats.tracks !== undefined) {
    report += `\n📊 *DB 현황*\n`;
    report += `  🎵 트랙: ${dbStats.tracks}곡\n`;
    report += `  👥 사용자: ${dbStats.users}명\n`;
    report += `  💬 댓글: ${dbStats.comments}개\n`;
  }

  /* 환경변수 체크 */
  report += `\n🔑 *환경변수*\n`;
  const envs = [
    ["SUPABASE", !!SB_URL && !!SB_KEY],
    ["KIE\\_API\\_KEY", !!KIE_KEY],
    ["TELEGRAM", !!TG_TOKEN && !!TG_CHAT],
    ["ANTHROPIC", !!ANTHROPIC],
    ["VAPID", !!VAPID_PUB],
    ["TOSS", !!TOSS_CK || !!TOSS_SK],
  ];
  for (const [name, ok] of envs) {
    report += `  ${ok ? "✅" : "⚠️"} ${name}\n`;
  }

  /* 종합 판정 */
  report += `\n*종합: ${okCount}/${total} 정상*\n`;
  if (allOk) {
    report += `🟢 모든 외부 연동 정상 작동 중`;
  } else {
    const failed = checks.filter(c => !c.ok);
    report += `\n🔴 *장애 감지 (${failed.length}건)*\n`;
    failed.forEach(c => {
      report += `  ❌ ${c.name}: ${c.error || c.status}\n`;
    });
    report += `\n즉시 점검이 필요합니다.`;
  }
  report += `\n\n🔗 ${BASE}`;

  /* 전송 (텔레그램 + 카카오) */
  const kakaoReport = report.replace(/\*/g, '');
  const [sent] = await Promise.allSettled([
    tgSend(report),
    fetch('https://ai-music-studio-bice.vercel.app/api/kakao-notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: kakaoReport }),
    }).catch(() => {}),
  ]).then(r => r.map(x => x.status === 'fulfilled' ? x.value : false));
  return res.status(200).json({ success: sent, okCount, total, checks, dbStats });
}
