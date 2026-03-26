/**
 * /api/app-settings — 앱 전역 설정 읽기/쓰기
 *
 * GET                        → 공개 설정 조회 (community_auto_publish 등)
 * POST { key, value }        → 관리자 전용 설정 저장 (Authorization: Bearer ADMIN_SECRET)
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

async function sb(method, path, body = null) {
  if (!SB_URL || !SB_KEY) throw new Error('Supabase 미설정');
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: method === 'GET' ? '' : 'return=representation,resolution=merge-duplicates',
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1${path}`, opts);
  const txt = await r.text();
  if (!r.ok) throw new Error(`SB ${r.status}: ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}

/* 설정 키 화이트리스트 */
const ALLOWED_KEYS = ['community_auto_publish'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* GET — 공개 설정 조회 */
  if (req.method === 'GET') {
    try {
      const rows = await sb('GET', '/settings?select=key,value&key=in.(' + ALLOWED_KEYS.map(k => `"${k}"`).join(',') + ')');
      const settings = {};
      if (Array.isArray(rows)) {
        rows.forEach(r => { settings[r.key] = r.value; });
      }
      /* 기본값 */
      if (settings.community_auto_publish === undefined) settings.community_auto_publish = true;
      return res.status(200).json(settings);
    } catch (e) {
      /* Supabase 미설정 시 기본값 반환 */
      return res.status(200).json({ community_auto_publish: true });
    }
  }

  /* POST — 관리자 전용 설정 저장 */
  if (req.method === 'POST') {
    const auth = (req.headers.authorization || '').replace('Bearer ', '');
    if (!ADMIN_SECRET || auth !== ADMIN_SECRET) {
      return res.status(401).json({ error: '관리자 인증 필요' });
    }
    const { key, value } = req.body || {};
    if (!key || !ALLOWED_KEYS.includes(key)) {
      return res.status(400).json({ error: '허용되지 않은 설정 키: ' + key });
    }
    try {
      await sb('POST', '/settings?on_conflict=key', { key, value, updated_at: new Date().toISOString() });
      return res.status(200).json({ ok: true, key, value });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
