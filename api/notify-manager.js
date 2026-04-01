/**
 * /api/notify-manager — 매니저 등록 알림 이메일 발송
 * Resend API 또는 간단한 SMTP 대안 사용
 * 환경변수 없어도 동작: 이메일 내용을 JSON으로 반환 (프론트에서 mailto: 처리)
 */

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const RESEND_KEY = process.env.RESEND_KEY || '';
const APP_URL = 'https://ddinggok.com';

function isAdmin(req) {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  return auth === ADMIN_SECRET;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

  let body = req.body || {};
  if (typeof body === 'string') try { body = JSON.parse(body); } catch { body = {}; }

  const { name, mgr_id, email, role, memo } = body;
  if (!email) return res.status(200).json({ success: true, method: 'skip', reason: 'no email' });

  const roleLabels = { admin: '관리자', super: '슈퍼매니저', manager: '매니저', viewer: '뷰어' };
  const roleLabel = roleLabels[role] || role || '매니저';
  const loginUrl = `${APP_URL}/admin/login.html`;

  const subject = `[KMS] 매니저 계정이 생성되었습니다 - ${name}님`;
  const htmlBody = `
<div style="font-family:'Apple SD Gothic Neo',sans-serif;max-width:520px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:12px;padding:20px 24px;color:#fff;margin-bottom:20px;">
    <div style="font-size:18px;font-weight:800;">🎵 띵곡</div>
    <div style="font-size:12px;opacity:0.9;margin-top:4px;">매니저 계정 생성 알림</div>
  </div>
  <div style="background:#f8f9fa;border-radius:12px;padding:20px;margin-bottom:16px;">
    <p style="font-size:15px;font-weight:700;color:#1a1a2e;margin:0 0 12px;">안녕하세요, ${name}님!</p>
    <p style="font-size:13px;color:#555;margin:0 0 16px;line-height:1.6;">
      띵곡 관리자 페이지의 매니저 계정이 생성되었습니다.
    </p>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:16px;">
      <table style="width:100%;font-size:13px;color:#333;">
        <tr><td style="padding:4px 0;color:#888;width:80px;">아이디</td><td style="font-weight:700;">${mgr_id}</td></tr>
        <tr><td style="padding:4px 0;color:#888;">권한</td><td><span style="background:#7c3aed22;color:#7c3aed;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;">${roleLabel}</span></td></tr>
        ${memo ? `<tr><td style="padding:4px 0;color:#888;">메모</td><td>${memo}</td></tr>` : ''}
      </table>
    </div>
    <a href="${loginUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;font-size:14px;font-weight:700;padding:12px;border-radius:10px;text-decoration:none;">매니저 로그인 →</a>
    <p style="font-size:11px;color:#999;margin:12px 0 0;text-align:center;">비밀번호는 관리자에게 문의하세요</p>
  </div>
  <div style="font-size:10px;color:#aaa;text-align:center;padding-top:8px;border-top:1px solid #eee;">
    KMS Admin · ${APP_URL}/admin
  </div>
</div>`;

  // Resend API로 발송 시도
  if (RESEND_KEY) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'KMS Admin <noreply@resend.dev>',
          to: [email],
          subject,
          html: htmlBody,
        }),
      });
      const d = await r.json();
      if (r.ok) return res.status(200).json({ success: true, method: 'resend', id: d.id });
      return res.status(200).json({ success: false, method: 'resend', error: d.message || 'send failed' });
    } catch (e) {
      console.warn('[notify] Resend fail:', e.message);
    }
  }

  // Resend 없으면 mailto 링크 + 이메일 내용 반환
  return res.status(200).json({
    success: true,
    method: 'manual',
    email: { to: email, subject, html: htmlBody },
    loginUrl,
    message: 'RESEND_KEY 미설정 - 수동 발송 필요',
  });
}
