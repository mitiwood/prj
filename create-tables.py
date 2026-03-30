# -*- coding: utf-8 -*-
import json, urllib.request

SB_URL = 'https://efptichfxexjxfatnggm.supabase.co'
SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcHRpY2hmeGV4anhmYXRuZ2dtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MTYwNTQ4MCwiZXhwIjoyMDU3MTgxNDgwfQ.i5lzY2SCl2HRP1BoXNNf8A_ERH8QpUS-0VLuqcoMRXY'

TABLES = [
    # payments
    """CREATE TABLE IF NOT EXISTS public.payments (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY, order_id TEXT NOT NULL UNIQUE,
      user_name TEXT, user_provider TEXT, payment_key TEXT NOT NULL UNIQUE,
      amount INTEGER NOT NULL, plan TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DONE',
      method TEXT, cancel_reason TEXT, canceled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(), approved_at TIMESTAMPTZ
    )""",
    "ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY",

    # likes
    """CREATE TABLE IF NOT EXISTS public.likes (
      id BIGSERIAL PRIMARY KEY, user_name TEXT NOT NULL, user_provider TEXT NOT NULL,
      track_id TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'like', value INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_name, user_provider, track_id, type)
    )""",
    "ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY",

    # follows
    """CREATE TABLE IF NOT EXISTS public.follows (
      id BIGSERIAL PRIMARY KEY, follower_name TEXT NOT NULL, follower_provider TEXT NOT NULL,
      following_name TEXT NOT NULL, following_provider TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(follower_name, follower_provider, following_name, following_provider)
    )""",
    "ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY",

    # reports
    """CREATE TABLE IF NOT EXISTS public.reports (
      id BIGSERIAL PRIMARY KEY, reporter_name TEXT NOT NULL, reporter_provider TEXT NOT NULL,
      target_type TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT DEFAULT '',
      status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY",

    # notifications
    """CREATE TABLE IF NOT EXISTS public.notifications (
      id BIGSERIAL PRIMARY KEY, user_name TEXT NOT NULL, user_provider TEXT NOT NULL,
      type TEXT NOT NULL, title TEXT DEFAULT '', body TEXT DEFAULT '',
      data JSONB DEFAULT '{}', is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY",

    # live_notifications
    """CREATE TABLE IF NOT EXISTS public.live_notifications (
      id TEXT PRIMARY KEY, title TEXT DEFAULT '', body TEXT DEFAULT '',
      icon TEXT DEFAULT '', type TEXT DEFAULT 'info', target TEXT DEFAULT 'all',
      ts BIGINT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "ALTER TABLE public.live_notifications ENABLE ROW LEVEL SECURITY",

    # settings
    """CREATE TABLE IF NOT EXISTS public.settings (
      key TEXT PRIMARY KEY, value JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY",

    # announcements
    """CREATE TABLE IF NOT EXISTS public.announcements (
      id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
      icon TEXT DEFAULT '', type TEXT DEFAULT 'info', url TEXT DEFAULT '',
      target TEXT DEFAULT 'all', active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(), expires_at TIMESTAMPTZ DEFAULT NULL
    )""",
    "ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY",

    # managers
    """CREATE TABLE IF NOT EXISTS public.managers (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, mgr_id TEXT NOT NULL UNIQUE,
      pw_hash TEXT NOT NULL, email TEXT DEFAULT '', role TEXT DEFAULT 'manager',
      memo TEXT DEFAULT '', active BOOLEAN DEFAULT TRUE, last_access BIGINT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "ALTER TABLE public.managers ENABLE ROW LEVEL SECURITY",

    # attendance
    """CREATE TABLE IF NOT EXISTS public.attendance (
      id BIGSERIAL PRIMARY KEY,
      user_name TEXT NOT NULL,
      user_provider TEXT NOT NULL,
      check_date DATE NOT NULL,
      streak INTEGER DEFAULT 1,
      bonus_credits INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_name, user_provider, check_date)
    )""",
    "ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY",

    # indexes
    "CREATE INDEX IF NOT EXISTS idx_attendance_user ON public.attendance(user_name, user_provider)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(check_date DESC)",
    "CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(order_id)",
    "CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(user_name, user_provider)",
    "CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status)",
    "CREATE INDEX IF NOT EXISTS idx_payments_created ON public.payments(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_likes_track ON public.likes(track_id)",
    "CREATE INDEX IF NOT EXISTS idx_likes_user ON public.likes(user_name, user_provider)",
    "CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_name, follower_provider)",
    "CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows(following_name, following_provider)",
    "CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status)",
    "CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_name, user_provider, is_read)",
    "CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_live_notifications_created ON public.live_notifications(created_at DESC)",

    # claude_sessions (대화형 세션 관리)
    """CREATE TABLE IF NOT EXISTS public.claude_sessions (
      id BIGSERIAL PRIMARY KEY,
      chat_id TEXT NOT NULL,
      issue_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    )""",
    "ALTER TABLE public.claude_sessions ENABLE ROW LEVEL SECURITY",
    "CREATE INDEX IF NOT EXISTS idx_claude_sessions_active ON public.claude_sessions(chat_id, status) WHERE status = 'active'",
]

# RLS policies
POLICIES = [
    "DO $$ BEGIN CREATE POLICY payments_service_all ON public.payments FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE POLICY likes_public_read ON public.likes FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE POLICY likes_service_write ON public.likes FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE POLICY follows_public_read ON public.follows FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE POLICY follows_service_write ON public.follows FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE POLICY reports_service_all ON public.reports FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE POLICY notifications_public_read ON public.notifications FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE POLICY notifications_service_write ON public.notifications FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE POLICY live_notifications_public_read ON public.live_notifications FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE POLICY live_notifications_service_write ON public.live_notifications FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE POLICY settings_service_all ON public.settings FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE POLICY announcements_public_read ON public.announcements FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE POLICY announcements_service_write ON public.announcements FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE POLICY managers_service_write ON public.managers FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE POLICY attendance_public_read ON public.attendance FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE POLICY attendance_service_write ON public.attendance FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE POLICY claude_sessions_service_all ON public.claude_sessions FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
]

def run_sql(sql):
    payload = json.dumps(sql).encode('utf-8')
    req = urllib.request.Request(
        SB_URL + '/rest/v1/rpc/exec_sql',
        data=payload,
        headers={
            'apikey': SB_KEY,
            'Authorization': 'Bearer ' + SB_KEY,
            'Content-Type': 'application/json',
        },
        method='POST'
    )
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return 'OK'
    except urllib.error.HTTPError as e:
        return 'ERR ' + str(e.code)

# Try via Supabase Management API (pg-meta)
def run_query(sql):
    """Use the Supabase pg endpoint directly"""
    headers = {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }
    # Try rpc approach with combined SQL
    payload = json.dumps({'query': sql}).encode('utf-8')
    req = urllib.request.Request(SB_URL + '/rest/v1/rpc/exec_sql', data=payload, headers=headers, method='POST')
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return True, resp.read().decode()[:100]
    except urllib.error.HTTPError as e:
        return False, e.read().decode('utf-8', 'replace')[:200]

# First check if exec_sql RPC exists
ok, msg = run_query('SELECT 1')
if not ok and '404' in msg or 'not find' in msg.lower():
    print('exec_sql RPC not available. Creating it first...')
    # Can not create RPC without direct DB access
    print('ERROR: exec_sql function does not exist in Supabase.')
    print('Please run the SQL manually in Supabase Dashboard > SQL Editor')
    print('')
    print('Or create the exec_sql function first:')
    print("""
CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN EXECUTE query; END;
$$;
""")
else:
    print('exec_sql available, running queries...')
    all_sql = ';\n'.join(TABLES + POLICIES)
    ok, msg = run_query(all_sql)
    print('Result:', 'SUCCESS' if ok else 'FAILED')
    print(msg)

# Verify tables by querying them
print('\n--- Verification ---')
for table in ['payments','likes','follows','reports','notifications','live_notifications','settings','announcements','managers']:
    try:
        req = urllib.request.Request(
            SB_URL + '/rest/v1/' + table + '?select=count&limit=0',
            headers={'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Prefer': 'count=exact'},
        )
        resp = urllib.request.urlopen(req, timeout=5)
        cr = resp.headers.get('content-range', '')
        print(f'  {table}: OK (rows: {cr})')
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8','replace')[:100]
        if 'not find' in body.lower() or '404' in body:
            print(f'  {table}: NOT FOUND')
        else:
            print(f'  {table}: ERR {e.code}')
