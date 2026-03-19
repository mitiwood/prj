/**
 * /api/announcement — 인앱 공지 관리 API
 * GET    → 현재 활성 공지 조회 (인증 불필요)
 * POST   → 공지 등록 (관리자 인증)
 * DELETE → 공지 삭제 (관리자 인증)
 *
 * Supabase REST API 직접 사용 (SDK 불필요)
 * announcements 테이블 미존재 시 자동 생성
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'kenny2024!';
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || '';

function _tgNotify(text) {
  if (!TG_TOKEN || !TG_CHAT) return;
  fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'Markdown' }),
  }).catch(() => {});
}

let _memAnnouncement = null;
let _tableChecked = false;

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

async function ensureTable() {
  if (_tableChecked || !SB_URL || !SB_KEY) return;
  try {
    const test = await sb('/announcements?limit=1');
    if (test.ok) { _tableChecked = true; return; }
    // 테이블 없으면 SQL로 생성
    const sql = `
      CREATE TABLE IF NOT EXISTS public.announcements (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        title text NOT NULL,
        body text NOT NULL,
        icon text DEFAULT '🎵',
        type text DEFAULT 'info',
        url text DEFAULT '',
        target text DEFAULT 'all',
        active boolean DEFAULT true,
        created_at timestamptz DEFAULT now(),
        expires_at timestamptz
      );
      ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
      CREATE POLICY IF NOT EXISTS "anon_read" ON public.announcements FOR SELECT USING (true);
      CREATE POLICY IF NOT EXISTS "service_all" ON public.announcements FOR ALL USING (true);
    `;
    const r = await fetch(`${SB_URL}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    // rpc 방식 안 되면 raw SQL 엔드포인트 시도
    if (!r.ok) {
      const r2 = await fetch(`${SB_URL}/sql`, {
        method: 'POST',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      });
      if (r2.ok) _tableChecked = true;
    } else {
      _tableChecked = true;
    }
  } catch (e) {
    console.warn('[announcement] ensureTable failed:', e.message);
  }
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
  if (hasSb) await ensureTable();

  // GET — 현재 활성 공지 조회 (인증 불필요)
  if (req.method === 'GET') {
    try {
      let ann = null;
      if (hasSb) {
        const { data, ok } = await sb('/announcements?active=eq.true&order=created_at.desc&limit=1');
        if (ok && Array.isArray(data)) ann = data[0] || null;
        else ann = _memAnnouncement; // Supabase 실패 시 메모리 폴백
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
      // 어떤 에러든 graceful 반환
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

      let sbOk = false;
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
        sbOk = ok;
        if (!ok) console.warn('[announcement] Supabase insert failed:', JSON.stringify(data));
      }
      // Supabase 실패 또는 미사용 시 메모리에도 저장 (폴백)
      if (!sbOk) {
        _memAnnouncement = { ...annData, id: 'mem-' + Date.now(), createdAt: now.toISOString(), expiresAt: annData.expires_at };
      }
      const ts = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      _tgNotify(`📣 *인앱 공지 발송*\n제목: ${annData.title}\n대상: ${annData.target === 'all' ? '전체' : '로그인 사용자'}\n⏰ ${ts}`);
      return res.status(200).json({ success: true, storage: sbOk ? 'supabase' : 'memory' });
    } catch (e) {
      // 최후 폴백: 메모리 저장
      try {
        const { title, body, icon, type, url, target, expiresHours } = req.body || {};
        const now = new Date();
        _memAnnouncement = {
          id: 'mem-' + Date.now(), title, body, icon: icon || '🎵', type: type || 'info',
          url: url || '', target: target || 'all', active: true,
          created_at: now.toISOString(), createdAt: now.toISOString(),
          expires_at: expiresHours ? new Date(now.getTime() + expiresHours * 3600000).toISOString() : null,
          expiresAt: expiresHours ? new Date(now.getTime() + expiresHours * 3600000).toISOString() : null,
        };
        return res.status(200).json({ success: true, storage: 'memory', warning: e.message });
      } catch (e2) {
        return res.status(500).json({ success: false, error: e2.message });
      }
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
      }
      _memAnnouncement = null;
      return res.status(200).json({ success: true });
    } catch (e) {
      _memAnnouncement = null;
      return res.status(200).json({ success: true, warning: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
