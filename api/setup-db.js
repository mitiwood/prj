/**
 * /api/setup-db — Supabase 테이블 자동 생성 (관리자 전용)
 * GET  → 테이블 존재 여부 확인
 * POST → 누락된 테이블 생성 (Supabase SDK 사용)
 */
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'kenny2024!';

function getSb() {
  if (!SB_URL || !SB_KEY) return null;
  return createClient(SB_URL, SB_KEY);
}

async function tableExists(tableName) {
  if (!SB_URL || !SB_KEY) return false;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${tableName}?limit=0`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    return r.ok;
  } catch { return false; }
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
`;

const MANAGERS_RLS = `
ALTER TABLE public.managers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "managers_service_write" ON public.managers;
CREATE POLICY "managers_service_write" ON public.managers FOR ALL USING (auth.role() = 'service_role');
`;

const ANNOUNCEMENTS_SQL = `
CREATE TABLE IF NOT EXISTS public.announcements (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT DEFAULT '🎵',
  type TEXT DEFAULT 'info',
  url TEXT DEFAULT '',
  target TEXT DEFAULT 'all',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NULL
);
`;

const ANNOUNCEMENTS_RLS = `
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "announcements_service_write" ON public.announcements;
CREATE POLICY "announcements_service_write" ON public.announcements FOR ALL USING (auth.role() = 'service_role');
`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (auth !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const tables = { tracks: false, users: false, announcements: false, managers: false };
  for (const t of Object.keys(tables)) {
    tables[t] = await tableExists(t);
  }
  const missing = Object.entries(tables).filter(([,v]) => !v).map(([k]) => k);

  if (req.method === 'GET') {
    return res.status(200).json({ tables, allExist: !missing.length, missingTables: missing });
  }

  if (req.method === 'POST') {
    if (!missing.length) return res.status(200).json({ success: true, message: 'All tables exist' });

    const sb = getSb();
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });

    const results = [];

    for (const t of missing) {
      let sql = '';
      let rls = '';
      if (t === 'managers') { sql = MANAGERS_SQL; rls = MANAGERS_RLS; }
      else if (t === 'announcements') { sql = ANNOUNCEMENTS_SQL; rls = ANNOUNCEMENTS_RLS; }
      else continue;

      try {
        // Supabase SDK의 rpc를 통해 SQL 실행
        const { error } = await sb.rpc('exec_sql', { query: sql });
        if (error) {
          // rpc 없으면 직접 REST로 시도
          const r = await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              apikey: SB_KEY,
              Authorization: `Bearer ${SB_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({ query: sql }),
          });
          if (!r.ok) {
            results.push({ table: t, success: false, error: 'exec_sql RPC not found. Run SQL manually in Supabase Dashboard.', sql: sql + rls });
            continue;
          }
        }
        // RLS 설정
        await sb.rpc('exec_sql', { query: rls }).catch(() => {});
        results.push({ table: t, success: true });
      } catch (e) {
        results.push({ table: t, success: false, error: e.message, sql: sql + rls });
      }
    }

    const allCreated = results.every(r => r.success);
    return res.status(200).json({
      success: allCreated,
      results,
      message: allCreated ? 'All tables created!' : 'Some tables need manual creation in Supabase SQL Editor',
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
