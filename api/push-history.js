/**
 * /api/push-history — 푸시 발송 히스토리 API
 * GET    → 히스토리 조회 (관리자 인증)
 * POST   → 히스토리 저장 (발송 후 기록)
 * DELETE → 히스토리 삭제 (?id=xxx 또는 ?all=true)
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

let _memHistory = [];

async function sb(path, opts = {}) {
  if (!SB_URL || !SB_KEY) throw new Error('no_supabase');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`${SB_URL}/rest/v1${path}`, {
      ...opts,
      signal: controller.signal,
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
  } finally {
    clearTimeout(timeout);
  }
}

let _tableChecked = false;
async function ensureTable() {
  if (_tableChecked || !SB_URL || !SB_KEY) return;
  try {
    const test = await sb('/push_history?limit=1');
    if (test.ok) { _tableChecked = true; return; }
    // 테이블 없으면 생성 시도
    const sql = `CREATE TABLE IF NOT EXISTS public.push_history (
      id bigserial PRIMARY KEY,
      title text NOT NULL,
      body text,
      url text DEFAULT '',
      target text DEFAULT 'all',
      icon text DEFAULT '',
      sent int DEFAULT 0,
      failed int DEFAULT 0,
      total int DEFAULT 0,
      sub_count int DEFAULT 0,
      login_count int DEFAULT 0,
      recipients jsonb DEFAULT '[]',
      is_test boolean DEFAULT false,
      created_at timestamptz DEFAULT now()
    );`;
    await fetch(`${SB_URL}/rest/v1/rpc/`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    }).catch(() => {});
    _tableChecked = true;
  } catch { _tableChecked = true; }
}

function checkAuth(req) {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  return auth === ADMIN_SECRET;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const hasSb = !!(SB_URL && SB_KEY);
  if (hasSb) await ensureTable();

  // GET — 히스토리 조회
  if (req.method === 'GET') {
    const limit = parseInt(req.query?.limit) || 100;
    try {
      if (hasSb) {
        const { data, ok } = await sb(`/push_history?order=created_at.desc&limit=${limit}`);
        if (ok && Array.isArray(data)) {
          return res.status(200).json({ history: data, source: 'supabase' });
        }
      }
      // 폴백: 메모리
      return res.status(200).json({ history: _memHistory.slice(0, limit), source: 'memory' });
    } catch (e) {
      return res.status(200).json({ history: _memHistory.slice(0, limit), source: 'memory', error: e.message });
    }
  }

  // POST — 히스토리 저장
  if (req.method === 'POST') {
    try {
      const { title, body, url, target, icon, sent, failed, total, sub_count, login_count, recipients, is_test } = req.body || {};
      if (!title) return res.status(400).json({ error: 'title required' });

      const row = {
        title, body: body || '', url: url || '', target: target || 'all',
        icon: icon || '', sent: sent || 0, failed: failed || 0, total: total || 0,
        sub_count: sub_count || 0, login_count: login_count || 0,
        recipients: JSON.stringify(recipients || []), is_test: !!is_test,
      };

      if (hasSb) {
        const { ok, data } = await sb('/push_history', {
          method: 'POST',
          body: JSON.stringify(row),
          prefer: 'return=representation',
        });
        if (ok) return res.status(200).json({ success: true, id: Array.isArray(data) ? data[0]?.id : null, storage: 'supabase' });
      }
      // 폴백: 메모리
      const memRow = { ...row, id: Date.now(), created_at: new Date().toISOString(), recipients: recipients || [] };
      _memHistory.unshift(memRow);
      if (_memHistory.length > 200) _memHistory = _memHistory.slice(0, 200);
      return res.status(200).json({ success: true, id: memRow.id, storage: 'memory' });
    } catch (e) {
      // 최후 폴백
      const memRow = { ...(req.body || {}), id: Date.now(), created_at: new Date().toISOString() };
      _memHistory.unshift(memRow);
      return res.status(200).json({ success: true, id: memRow.id, storage: 'memory', warning: e.message });
    }
  }

  // DELETE — 히스토리 삭제
  if (req.method === 'DELETE') {
    const id = req.query?.id;
    const all = req.query?.all === 'true';
    try {
      if (all) {
        if (hasSb) await sb('/push_history?id=gt.0', { method: 'DELETE' });
        _memHistory = [];
        return res.status(200).json({ success: true, deleted: 'all' });
      }
      if (id) {
        if (hasSb) await sb(`/push_history?id=eq.${id}`, { method: 'DELETE' });
        _memHistory = _memHistory.filter(h => String(h.id) !== String(id));
        return res.status(200).json({ success: true, deleted: id });
      }
      return res.status(400).json({ error: 'id or all=true required' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
