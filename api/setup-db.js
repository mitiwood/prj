/**
 * /api/setup-db — Supabase 테이블 자동 생성 (관리자 전용, 1회 실행)
 * GET → 테이블 존재 여부 확인
 * POST → 누락된 테이블 생성
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'kenny2024!';

async function sbRpc(sql) {
  if (!SB_URL || !SB_KEY) throw new Error('no_supabase');
  const r = await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  // rpc 없으면 직접 SQL 실행 시도
  if (!r.ok) {
    // pg_catalog 쿼리로 테이블 확인
    const r2 = await fetch(`${SB_URL}/rest/v1/rpc/`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    });
    throw new Error('RPC not available');
  }
  return await r.json();
}

async function tableExists(tableName) {
  if (!SB_URL || !SB_KEY) return false;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${tableName}?limit=0`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    return r.ok || r.status === 200;
  } catch { return false; }
}

async function createTable(tableName, sql) {
  // Supabase REST API로는 DDL 불가 → pg REST endpoint 사용
  const r = await fetch(`${SB_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
  });
  // 대안: Supabase에서 직접 SQL 실행 필요
  throw new Error('DDL_NOT_SUPPORTED_VIA_REST');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (auth !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const tables = ['tracks', 'users', 'announcements', 'managers'];
  const results = {};

  for (const t of tables) {
    results[t] = await tableExists(t);
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      tables: results,
      allExist: Object.values(results).every(Boolean),
      missingTables: Object.entries(results).filter(([,v]) => !v).map(([k]) => k),
      sql: !results.managers ? MANAGERS_SQL : null,
    });
  }

  // POST — 누락 테이블 SQL 제공 (Supabase SQL Editor에서 실행 필요)
  if (req.method === 'POST') {
    const missing = Object.entries(results).filter(([,v]) => !v).map(([k]) => k);
    if (!missing.length) return res.status(200).json({ success: true, message: 'All tables exist' });

    return res.status(200).json({
      success: false,
      message: 'Supabase SQL Editor에서 아래 SQL을 실행하세요',
      missingTables: missing,
      sql: missing.includes('managers') ? MANAGERS_SQL : '',
      supabaseUrl: SB_URL ? SB_URL.replace('.supabase.co', '.supabase.co') + '/project/default/sql' : 'unknown',
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

const MANAGERS_SQL = `
CREATE TABLE IF NOT EXISTS public.managers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  mgr_id TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  email TEXT DEFAULT '',
  role TEXT DEFAULT 'manager',
  memo TEXT DEFAULT '',
  active BOOLEAN DEFAULT TRUE,
  last_access BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.managers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "managers_service_write" ON public.managers;
CREATE POLICY "managers_service_write" ON public.managers FOR ALL USING (auth.role() = 'service_role');
`;
