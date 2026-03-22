/**
 * /api/setup-db — Supabase 테이블 자동 생성 (관리자 전용)
 * GET  → 테이블 존재 여부 확인
 * POST → 누락된 테이블 생성 (Supabase SDK 사용)
 */
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

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

const ALL_TABLE_SQL = {
  payments: `CREATE TABLE IF NOT EXISTS public.payments (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, order_id TEXT NOT NULL UNIQUE, user_name TEXT, user_provider TEXT, payment_key TEXT NOT NULL UNIQUE, amount INTEGER NOT NULL, plan TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DONE', method TEXT, cancel_reason TEXT, canceled_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), approved_at TIMESTAMPTZ)`,
  likes: `CREATE TABLE IF NOT EXISTS public.likes (id BIGSERIAL PRIMARY KEY, user_name TEXT NOT NULL, user_provider TEXT NOT NULL, track_id TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'like', value INTEGER DEFAULT 1, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_name, user_provider, track_id, type))`,
  follows: `CREATE TABLE IF NOT EXISTS public.follows (id BIGSERIAL PRIMARY KEY, follower_name TEXT NOT NULL, follower_provider TEXT NOT NULL, following_name TEXT NOT NULL, following_provider TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(follower_name, follower_provider, following_name, following_provider))`,
  reports: `CREATE TABLE IF NOT EXISTS public.reports (id BIGSERIAL PRIMARY KEY, reporter_name TEXT NOT NULL, reporter_provider TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT DEFAULT '', status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  notifications: `CREATE TABLE IF NOT EXISTS public.notifications (id BIGSERIAL PRIMARY KEY, user_name TEXT NOT NULL, user_provider TEXT NOT NULL, type TEXT NOT NULL, title TEXT DEFAULT '', body TEXT DEFAULT '', data JSONB DEFAULT '{}', is_read BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  live_notifications: `CREATE TABLE IF NOT EXISTS public.live_notifications (id TEXT PRIMARY KEY, title TEXT DEFAULT '', body TEXT DEFAULT '', icon TEXT DEFAULT '', type TEXT DEFAULT 'info', target TEXT DEFAULT 'all', ts BIGINT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`,
  settings: `CREATE TABLE IF NOT EXISTS public.settings (key TEXT PRIMARY KEY, value JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT NOW())`,
  comments: `CREATE TABLE IF NOT EXISTS public.comments (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, track_id TEXT NOT NULL, parent_id TEXT, author_name TEXT DEFAULT '', author_avatar TEXT DEFAULT '', author_provider TEXT DEFAULT '', content TEXT DEFAULT '', is_hidden BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  tracks: `CREATE TABLE IF NOT EXISTS public.tracks (id TEXT PRIMARY KEY, title TEXT DEFAULT '', tags TEXT DEFAULT '', lyrics TEXT DEFAULT '', audio_url TEXT DEFAULT '', image_url TEXT DEFAULT '', video_url TEXT DEFAULT '', model TEXT DEFAULT '', prompt TEXT DEFAULT '', user_name TEXT DEFAULT '', user_provider TEXT DEFAULT '', is_public BOOLEAN DEFAULT TRUE, play_count INTEGER DEFAULT 0, like_count INTEGER DEFAULT 0, dislike_count INTEGER DEFAULT 0, duration INTEGER DEFAULT 0, task_id TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW())`,
  users: `CREATE TABLE IF NOT EXISTS public.users (id BIGSERIAL PRIMARY KEY, uid TEXT NOT NULL, name TEXT DEFAULT '', email TEXT DEFAULT '', avatar TEXT DEFAULT '', provider TEXT NOT NULL, plan TEXT DEFAULT 'free', plan_expires TIMESTAMPTZ, credits_song INTEGER DEFAULT 5, credits_mv INTEGER DEFAULT 0, credits_lyrics INTEGER DEFAULT 5, ua TEXT DEFAULT '', is_mobile BOOLEAN DEFAULT FALSE, login_count INTEGER DEFAULT 1, last_login BIGINT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(uid, provider))`,
  chat_messages: `CREATE TABLE IF NOT EXISTS public.chat_messages (id BIGSERIAL PRIMARY KEY, room TEXT NOT NULL DEFAULT 'general', author_name TEXT NOT NULL, author_avatar TEXT DEFAULT '', author_provider TEXT DEFAULT '', content TEXT NOT NULL, reply_to TEXT DEFAULT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`,
  challenges: `CREATE TABLE IF NOT EXISTS public.challenges (id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '', icon TEXT DEFAULT '🔥', theme TEXT DEFAULT '', start_at TIMESTAMPTZ DEFAULT NOW(), end_at TIMESTAMPTZ, reward TEXT DEFAULT '', active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  playlists: `CREATE TABLE IF NOT EXISTS public.playlists (id BIGSERIAL PRIMARY KEY, user_name TEXT NOT NULL, user_provider TEXT NOT NULL, name TEXT NOT NULL DEFAULT '내 플레이리스트', description TEXT DEFAULT '', track_ids JSONB DEFAULT '[]', is_public BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`,
  attendance: `CREATE TABLE IF NOT EXISTS public.attendance (id BIGSERIAL PRIMARY KEY, user_name TEXT NOT NULL, user_provider TEXT NOT NULL, check_date DATE NOT NULL DEFAULT CURRENT_DATE, streak INTEGER DEFAULT 1, bonus_credits INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_name, user_provider, check_date))`,
  error_logs: `CREATE TABLE IF NOT EXISTS public.error_logs (id BIGSERIAL PRIMARY KEY, endpoint TEXT NOT NULL, method TEXT DEFAULT 'GET', status INTEGER DEFAULT 500, error_message TEXT DEFAULT '', user_agent TEXT DEFAULT '', ip TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW())`,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (auth !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const tables = { tracks:false, users:false, comments:false, announcements:false, managers:false, payments:false, likes:false, follows:false, reports:false, notifications:false, live_notifications:false, settings:false, chat_messages:false, challenges:false, playlists:false, attendance:false, error_logs:false };
  for (const t of Object.keys(tables)) {
    tables[t] = await tableExists(t);
  }
  const missing = Object.entries(tables).filter(([,v]) => !v).map(([k]) => k);

  if (req.method === 'GET') {
    return res.status(200).json({ tables, allExist: !missing.length, missingTables: missing });
  }

  if (req.method === 'POST') {
    /* exec_sql 직접 실행 (관리자용) */
    const rawSql = req.body?.sql;
    if (rawSql) {
      try {
        const sb = getSb();
        if (!sb) return res.status(500).json({ error: 'Supabase not configured' });
        const { error } = await sb.rpc('exec_sql', { query: rawSql });
        if (error) return res.status(200).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, executed: true });
      } catch (e) {
        return res.status(200).json({ success: false, error: e.message });
      }
    }

    if (!missing.length) return res.status(200).json({ success: true, message: 'All tables exist' });

    const sb = getSb();
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });

    const results = [];

    for (const t of missing) {
      let sql = ALL_TABLE_SQL[t] || '';
      let rls = '';
      if (t === 'managers') { sql = sql || MANAGERS_SQL; rls = MANAGERS_RLS; }
      else if (t === 'announcements') { sql = sql || ANNOUNCEMENTS_SQL; rls = ANNOUNCEMENTS_RLS; }
      if (!sql) continue;
      /* RLS 자동 생성 */
      if (!rls) rls = `ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`;

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
