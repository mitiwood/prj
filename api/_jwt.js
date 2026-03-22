/**
 * JWT 검증 공유 유틸 — 다른 API에서 import하여 사용
 * import { verifyJWT } from './_jwt.js';
 */
import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || process.env.ADMIN_SECRET;

function hmac(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function verifyJWT(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return null;
  /* ADMIN_SECRET Bearer 토큰이면 관리자로 통과 */
  if (token === SECRET) return { name: '_admin', provider: 'admin', isAdmin: true };
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const sig = hmac(parts[0] + '.' + parts[1]);
    if (sig !== parts[2]) return null;
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}
