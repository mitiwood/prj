/**
 * /api/announcement — 인앱 공지 관리 API
 * GET    → 현재 활성 공지 조회 (인증 불필요)
 * POST   → 공지 등록 (관리자 인증)
 * DELETE → 공지 삭제 (관리자 인증)
 *
 * Supabase REST API 직접 사용 (SDK 불필요)
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'kenny2024!';

let _memAnnouncement = null;

async function sb(path, opts = {}) {
  if (!SB_URL || !SB_KEY) throw new Error('no_supabase');
  const r = await fetch(`${SB_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json; charset=utf-8',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { data, status: r.status, ok: r.ok };
}

function isExpired(ann) {
  if (!ann) return true;
  if (ann.expires_at && new Date(ann.expires_at) < new Date()) return true;
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const hasSb = !!(SB_URL && SB_KEY);

  // GET — 현재 활성 공지 조회 (인증 불필요)
  if (req.method === 'GET') {
    try {
      let ann = null;
      if (hasSb) {
        const { data } = await sb('/announcements?active=eq.true&order=created_at.desc&limit=1');
        ann = Array.isArray(data) ? data[0] || null : null;
      } else {
        ann = _memAnnouncement;
      }
      if (isExpired(ann)) {
        return res.status(200).json({ hasAnnouncement: false, announcement: null });
      }
      return res.status(200).json({
        hasAnnouncement: !!ann,
        announcement: ann ? {
          id: ann.id,
          title: ann.title,
          body: ann.body,
          icon: ann.icon || '🎵',
          type: ann.type || 'info',
          url: ann.url || '',
          target: ann.target || 'all',
          createdAt: ann.created_at || ann.createdAt,
          expiresAt: ann.expires_at || ann.expiresAt || null,
        } : null
      });
    } catch (e) {
      return res.status(200).json({ hasAnnouncement: false, announcement: null, error: e.message });
    }
  }

  // POST/DELETE — 인증 필요
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (auth !== ADMIN_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  // POST — 공지 등록
  if (req.method === 'POST') {
    try {
      const { title, body, icon, type, url, target, expiresHours } = req.body || {};
      if (!title || !body) {
        return res.status(400).json({ success: false, error: '제목과 내용을 입력하세요' });
      }
      const now = new Date();
      const annData = {
        title,
        body,
        icon: icon || '🎵',
        type: type || 'info',
        url: url || '',
        target: target || 'all',
        active: true,
        created_at: now.toISOString(),
        expires_at: expiresHours ? new Date(now.getTime() + expiresHours * 3600000).toISOString() : null,
      };

      if (hasSb) {
        // 기존 공지 비활성화
        await sb('/announcements?active=eq.true', {
          method: 'PATCH',
          body: JSON.stringify({ active: false }),
        });
        // 새 공지 등록
        const { ok, data } = await sb('/announcements', {
          method: 'POST',
          body: JSON.stringify(annData),
          prefer: 'return=minimal',
        });
        if (!ok) throw new Error(JSON.stringify(data));
      } else {
        _memAnnouncement = { ...annData, id: 'mem-' + Date.now(), createdAt: now.toISOString(), expiresAt: annData.expires_at };
      }
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // DELETE — 공지 삭제
  if (req.method === 'DELETE') {
    try {
      if (hasSb) {
        await sb('/announcements?active=eq.true', {
          method: 'PATCH',
          body: JSON.stringify({ active: false }),
        });
      } else {
        _memAnnouncement = null;
      }
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
