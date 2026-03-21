/**
 * /api/auth/token — JWT 토큰 발급/검증
 *
 * POST { name, provider, avatar } → JWT 발급
 * GET ?token=xxx → 토큰 검증
 *
 * JWT는 간단한 HMAC-SHA256 기반 (외부 라이브러리 없이)
 */

const SECRET = process.env.JWT_SECRET || process.env.ADMIN_SECRET || 'kenny2024!';

function base64url(str) {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

import crypto from 'crypto';

function hmac(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function createToken(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 * 30 /* 30일 */ }));
  const sig = hmac(header + '.' + body);
  return header + '.' + body + '.' + sig;
}

function verifyToken(token) {
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

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* POST: 토큰 발급 */
  if (req.method === 'POST') {
    const { name, provider, avatar } = req.body || {};
    if (!name || !provider) return res.status(400).json({ error: 'name and provider required' });

    const token = createToken({ name, provider, avatar: avatar || '' });
    return res.status(200).json({ ok: true, token, expiresIn: '30d' });
  }

  /* GET: 토큰 검증 */
  if (req.method === 'GET') {
    const token = req.query?.token || (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(400).json({ ok: false, error: 'token required' });

    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ ok: false, error: 'invalid or expired token' });

    return res.status(200).json({ ok: true, user: payload });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

/* 외부 API에서 import 가능 */
export { verifyToken, createToken };
