/**
 * /api/auth/token — JWT 토큰 발급/검증
 *
 * POST { name, provider, avatar } → JWT 발급
 * GET ?token=xxx → 토큰 검증
 *
 * JWT는 간단한 HMAC-SHA256 기반 (외부 라이브러리 없이)
 */

const SECRET = process.env.JWT_SECRET || process.env.ADMIN_SECRET;

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

function _parseDevice(ua) {
  if (!ua) return 'Unknown';
  let os = 'Unknown', browser = 'Unknown';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac/i.test(ua)) os = 'Mac';
  else if (/Linux/i.test(ua)) os = 'Linux';
  if (/Chrome\/\d/i.test(ua) && !/Edg/i.test(ua)) browser = 'Chrome';
  else if (/Safari\/\d/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox\/\d/i.test(ua)) browser = 'Firefox';
  else if (/Edg\/\d/i.test(ua)) browser = 'Edge';
  return os + ' / ' + browser;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SECRET) return res.status(500).json({ ok: false, error: 'JWT_SECRET or ADMIN_SECRET not configured' });

  /* POST: 토큰 발급 (세션 ID 포함) */
  if (req.method === 'POST') {
    const { name, provider, avatar } = req.body || {};
    if (!name || !provider) return res.status(400).json({ error: 'name and provider required' });

    /* 고유 세션 ID 생성 */
    const sessionId = crypto.randomBytes(16).toString('hex');
    const ua = req.headers['user-agent'] || '';
    const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
    const isMobile = /iPhone|iPad|Android|Mobile/i.test(ua);
    const deviceInfo = _parseDevice(ua);

    const token = createToken({ name, provider, avatar: avatar || '', sid: sessionId });

    /* Supabase에 세션 정보 저장 (이전 세션 무효화) */
    const SB_URL = process.env.SUPABASE_URL;
    const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
    if (SB_URL && SB_KEY) {
      try {
        const body = JSON.stringify({ session_id: sessionId, session_device: deviceInfo, session_ip: ip, session_at: Date.now() });
        await fetch(`${SB_URL}/rest/v1/users?name=ilike.${encodeURIComponent(name)}&provider=eq.${encodeURIComponent(provider)}`, {
          method: 'PATCH',
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body,
        });
      } catch (e) { console.warn('[token] session save:', e.message); }
    }

    return res.status(200).json({ ok: true, token, sessionId, expiresIn: '30d' });
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
