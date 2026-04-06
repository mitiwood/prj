/**
 * 일회성 채팅 마이그레이션 — 실행 후 삭제
 * POST /api/migrate-chat
 */
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

const SQLS = [
  /* chat_reactions 테이블 */
  `CREATE TABLE IF NOT EXISTS public.chat_reactions (
    id              BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    msg_id          TEXT        NOT NULL,
    room            TEXT        NOT NULL DEFAULT 'general',
    emoji           TEXT        NOT NULL,
    author_name     TEXT        NOT NULL,
    author_provider TEXT        NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(msg_id, emoji, author_name, author_provider)
  )`,
  `ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_reactions' AND policyname='chat_reactions_public_read') THEN
      CREATE POLICY chat_reactions_public_read ON public.chat_reactions FOR SELECT USING (true);
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_reactions' AND policyname='chat_reactions_service_write') THEN
      CREATE POLICY chat_reactions_service_write ON public.chat_reactions FOR ALL USING (auth.role() = 'service_role');
    END IF;
  END $$`,
  `CREATE INDEX IF NOT EXISTS idx_chat_reactions_msg ON public.chat_reactions(msg_id)`,

  /* chat_reports 테이블 */
  `CREATE TABLE IF NOT EXISTS public.chat_reports (
    id                BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    msg_id            TEXT        NOT NULL,
    room              TEXT        DEFAULT 'general',
    reporter_name     TEXT        NOT NULL,
    reporter_provider TEXT        NOT NULL DEFAULT '',
    reason            TEXT        NOT NULL,
    created_at        TIMESTAMPTZ DEFAULT NOW()
  )`,
  `ALTER TABLE public.chat_reports ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_reports' AND policyname='chat_reports_service_write') THEN
      CREATE POLICY chat_reports_service_write ON public.chat_reports FOR ALL USING (auth.role() = 'service_role');
    END IF;
  END $$`,
  `CREATE INDEX IF NOT EXISTS idx_chat_reports_msg ON public.chat_reports(msg_id)`,

  /* chat_messages.edited_at 컬럼 추가 */
  `ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ DEFAULT NULL`,
];

async function runSql(sql) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const txt = await r.text();
  return { status: r.status, body: txt };
}

/* Supabase Management API를 통한 SQL 실행 */
async function runSqlMgmt(sql) {
  const projectRef = SB_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) throw new Error('Cannot parse project ref from SB_URL');
  const r = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const txt = await r.text();
  return { status: r.status, body: txt };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'No Supabase config' });

  const results = [];
  for (const sql of SQLS) {
    const label = sql.trim().slice(0, 60).replace(/\s+/g, ' ');
    try {
      const { status, body } = await runSqlMgmt(sql);
      results.push({ label, status, ok: status < 300, body: body.slice(0, 200) });
    } catch (e) {
      results.push({ label, ok: false, error: e.message });
    }
  }

  const allOk = results.every(r => r.ok);
  return res.status(200).json({ ok: allOk, results });
}
