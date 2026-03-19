-- ============================================================
-- Kenny's Music Studio — Supabase 스키마 (최종판)
-- SQL Editor에서 전체 복사 → Run
-- ============================================================

-- 1. tracks 테이블
CREATE TABLE IF NOT EXISTS public.tracks (
  id              TEXT        PRIMARY KEY,
  task_id         TEXT        DEFAULT '',
  title           TEXT        DEFAULT '무제',
  audio_url       TEXT        NOT NULL DEFAULT '',
  video_url       TEXT        DEFAULT '',
  image_url       TEXT        DEFAULT '',
  tags            TEXT        DEFAULT '',
  lyrics          TEXT        DEFAULT '',
  gen_mode        TEXT        DEFAULT 'custom',
  owner_name      TEXT        DEFAULT '익명',
  owner_avatar    TEXT        DEFAULT '',
  owner_provider  TEXT        DEFAULT 'guest',
  is_public       BOOLEAN     DEFAULT TRUE,
  comm_likes      INTEGER     DEFAULT 0,
  comm_dislikes   INTEGER     DEFAULT 0,
  comm_plays      INTEGER     DEFAULT 0,
  created         BIGINT      DEFAULT 0,       -- epoch ms
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. users 테이블
CREATE TABLE IF NOT EXISTS public.users (
  id              BIGSERIAL   PRIMARY KEY,
  name            TEXT        NOT NULL,
  provider        TEXT        NOT NULL,
  email           TEXT        DEFAULT '',
  avatar          TEXT        DEFAULT '',
  uid             TEXT        DEFAULT '',
  ua              TEXT        DEFAULT '',
  is_mobile       BOOLEAN     DEFAULT FALSE,
  login_count     INTEGER     DEFAULT 1,
  last_login      BIGINT      NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, provider)
);

-- 3. RLS 활성화
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users  ENABLE ROW LEVEL SECURITY;

-- 4. 공개 읽기 정책 (anon 키)
DROP POLICY IF EXISTS "tracks_public_read"  ON public.tracks;
DROP POLICY IF EXISTS "users_public_read"   ON public.users;
CREATE POLICY "tracks_public_read"  ON public.tracks FOR SELECT USING (true);
CREATE POLICY "users_public_read"   ON public.users  FOR SELECT USING (true);

-- 5. 서버 쓰기 정책 (service_role 키)
DROP POLICY IF EXISTS "tracks_service_write" ON public.tracks;
DROP POLICY IF EXISTS "users_service_write"  ON public.users;
CREATE POLICY "tracks_service_write" ON public.tracks
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "users_service_write"  ON public.users
  FOR ALL USING (auth.role() = 'service_role');

-- 6. 인덱스
CREATE INDEX IF NOT EXISTS idx_tracks_owner   ON public.tracks(owner_name, owner_provider);
CREATE INDEX IF NOT EXISTS idx_tracks_created ON public.tracks(created DESC);
CREATE INDEX IF NOT EXISTS idx_tracks_likes   ON public.tracks(comm_likes DESC);
CREATE INDEX IF NOT EXISTS idx_users_login    ON public.users(last_login DESC);

-- 7. updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
