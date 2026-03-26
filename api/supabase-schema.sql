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
  owner_email     TEXT        DEFAULT '',
  owner_avatar    TEXT        DEFAULT '',
  owner_provider  TEXT        DEFAULT 'guest',
  is_public       BOOLEAN     DEFAULT TRUE,
  comm_likes      INTEGER     DEFAULT 0,
  comm_dislikes   INTEGER     DEFAULT 0,
  comm_plays      INTEGER     DEFAULT 0,
  created         BIGINT      DEFAULT 0,       -- epoch ms
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. users 테이블 (email+provider가 안정적 식별자)
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
  -- email이 있으면 email+provider로 유니크, 없으면 name+provider로 유니크
  -- CREATE UNIQUE INDEX idx_users_email_provider ON users(email, provider) WHERE email <> '';
  -- CREATE UNIQUE INDEX idx_users_name_provider_fallback ON users(name, provider) WHERE email = '';
);

-- 3. announcements 테이블 (인앱 공지)
CREATE TABLE IF NOT EXISTS public.announcements (
  id              BIGSERIAL   PRIMARY KEY,
  title           TEXT        NOT NULL,
  body            TEXT        NOT NULL,
  icon            TEXT        DEFAULT '🎵',
  type            TEXT        DEFAULT 'info',
  url             TEXT        DEFAULT '',
  target          TEXT        DEFAULT 'all',
  active          BOOLEAN     DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ DEFAULT NULL
);

-- 4. managers 테이블 (매니저 계정)
CREATE TABLE IF NOT EXISTS public.managers (
  id              BIGSERIAL   PRIMARY KEY,
  name            TEXT        NOT NULL,
  mgr_id          TEXT        NOT NULL UNIQUE,
  pw_hash         TEXT        NOT NULL,
  email           TEXT        DEFAULT '',
  role            TEXT        DEFAULT 'manager',
  memo            TEXT        DEFAULT '',
  active          BOOLEAN     DEFAULT TRUE,
  last_access     BIGINT      DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 5. RLS 활성화
ALTER TABLE public.tracks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managers      ENABLE ROW LEVEL SECURITY;

-- 5. 공개 읽기 정책 (anon 키)
DROP POLICY IF EXISTS "tracks_public_read"  ON public.tracks;
DROP POLICY IF EXISTS "users_public_read"   ON public.users;
CREATE POLICY "tracks_public_read"        ON public.tracks        FOR SELECT USING (true);
CREATE POLICY "users_public_read"         ON public.users         FOR SELECT USING (true);
DROP POLICY IF EXISTS "announcements_public_read" ON public.announcements;
CREATE POLICY "announcements_public_read" ON public.announcements FOR SELECT USING (true);

-- 6. 서버 쓰기 정책 (service_role 키)
DROP POLICY IF EXISTS "tracks_service_write" ON public.tracks;
DROP POLICY IF EXISTS "users_service_write"  ON public.users;
CREATE POLICY "tracks_service_write" ON public.tracks
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "users_service_write"  ON public.users
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "announcements_service_write" ON public.announcements;
CREATE POLICY "announcements_service_write" ON public.announcements
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "managers_service_write" ON public.managers;
CREATE POLICY "managers_service_write" ON public.managers
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

-- ============================================================
-- 8. 결제 (Toss Payments)
-- ============================================================

-- 8-1. users 테이블에 플랜/크레딧 컬럼 추가
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan           TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS credits_song   INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS credits_mv     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_lyrics INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS plan_expires   TIMESTAMPTZ;

-- 레거시 credits 컬럼이 있으면 credits_song으로 마이그레이션
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='credits') THEN
    UPDATE public.users SET credits_song = credits WHERE credits_song = 5 AND credits != 5;
    ALTER TABLE public.users DROP COLUMN IF EXISTS credits;
  END IF;
END $$;

-- 8-2. payments 테이블
CREATE TABLE IF NOT EXISTS public.payments (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id      TEXT NOT NULL UNIQUE,
  user_name     TEXT,
  user_provider TEXT,
  payment_key   TEXT NOT NULL UNIQUE,
  amount        INTEGER NOT NULL,
  plan          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'DONE',
  method        TEXT,
  cancel_reason TEXT,
  canceled_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  approved_at   TIMESTAMPTZ
);

-- 8-3. RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 서비스 롤만 전체 접근
CREATE POLICY payments_service_all ON public.payments
  FOR ALL USING (auth.role() = 'service_role');

-- 8-4. 인덱스
CREATE INDEX IF NOT EXISTS idx_payments_order       ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user        ON public.payments(user_name, user_provider);
CREATE INDEX IF NOT EXISTS idx_payments_status      ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created     ON public.payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_payment_key ON public.payments(payment_key);

-- ============================================================
-- 9. settings (키-값 저장소 — 카카오 토큰 등)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY settings_service_all ON public.settings
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 10. live_notifications (실시간 알림)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.live_notifications (
  id          TEXT PRIMARY KEY,
  title       TEXT DEFAULT '',
  body        TEXT DEFAULT '',
  icon        TEXT DEFAULT '🔔',
  type        TEXT DEFAULT 'info',
  target      TEXT DEFAULT 'all',
  ts          BIGINT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.live_notifications ENABLE ROW LEVEL SECURITY;

-- 공개 읽기 (접속 유저가 폴링)
CREATE POLICY live_notifications_public_read ON public.live_notifications
  FOR SELECT USING (true);

-- 서비스 롤만 쓰기/삭제
CREATE POLICY live_notifications_service_write ON public.live_notifications
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_live_notifications_created ON public.live_notifications(created_at DESC);

-- ============================================================
-- 11. likes (유저별 투표 추적 — 어뷰징 방지)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.likes (
  id          BIGSERIAL PRIMARY KEY,
  user_name   TEXT NOT NULL,
  user_provider TEXT NOT NULL,
  track_id    TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'like',  -- like, dislike, rating
  value       INTEGER DEFAULT 1,             -- rating: 1~5
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_name, user_provider, track_id, type)
);

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY likes_public_read ON public.likes FOR SELECT USING (true);
CREATE POLICY likes_service_write ON public.likes FOR ALL USING (auth.role() = 'service_role');
CREATE INDEX IF NOT EXISTS idx_likes_track ON public.likes(track_id);
CREATE INDEX IF NOT EXISTS idx_likes_user ON public.likes(user_name, user_provider);

-- ============================================================
-- 12. follows (팔로우 관계)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.follows (
  id              BIGSERIAL PRIMARY KEY,
  follower_name   TEXT NOT NULL,
  follower_provider TEXT NOT NULL,
  following_name  TEXT NOT NULL,
  following_provider TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_name, follower_provider, following_name, following_provider)
);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY follows_public_read ON public.follows FOR SELECT USING (true);
CREATE POLICY follows_service_write ON public.follows FOR ALL USING (auth.role() = 'service_role');
CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_name, follower_provider);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows(following_name, following_provider);

-- ============================================================
-- 13. reports (신고)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reports (
  id          BIGSERIAL PRIMARY KEY,
  reporter_name TEXT NOT NULL,
  reporter_provider TEXT NOT NULL,
  target_type TEXT NOT NULL,              -- track, comment, user
  target_id   TEXT NOT NULL,
  reason      TEXT NOT NULL DEFAULT '',
  status      TEXT DEFAULT 'pending',     -- pending, resolved, dismissed
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reports_service_all ON public.reports FOR ALL USING (auth.role() = 'service_role');
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);

-- ============================================================
-- 14. notifications (유저 알림 인박스)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id          BIGSERIAL PRIMARY KEY,
  user_name   TEXT NOT NULL,
  user_provider TEXT NOT NULL,
  type        TEXT NOT NULL,              -- like, comment, follow, system
  title       TEXT DEFAULT '',
  body        TEXT DEFAULT '',
  data        JSONB DEFAULT '{}',         -- {trackId, fromUser, ...}
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_public_read ON public.notifications FOR SELECT USING (true);
CREATE POLICY notifications_service_write ON public.notifications FOR ALL USING (auth.role() = 'service_role');
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_name, user_provider, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications(created_at DESC);

-- ============================================================
-- 15. collabs (콜라보 요청/워크스페이스)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.collabs (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_name         TEXT NOT NULL,
  from_provider     TEXT NOT NULL,
  from_avatar       TEXT DEFAULT '',
  to_name           TEXT NOT NULL,
  to_provider       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending, accepted, declined, cancelled, completed
  message           TEXT DEFAULT '',
  collab_data       JSONB DEFAULT '{}',
  track_id          TEXT DEFAULT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.collabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY collabs_public_read ON public.collabs FOR SELECT USING (true);
CREATE POLICY collabs_service_write ON public.collabs FOR ALL USING (auth.role() = 'service_role');
CREATE INDEX IF NOT EXISTS idx_collabs_from ON public.collabs(from_name, from_provider);
CREATE INDEX IF NOT EXISTS idx_collabs_to ON public.collabs(to_name, to_provider);
CREATE INDEX IF NOT EXISTS idx_collabs_status ON public.collabs(status);

-- tracks 테이블에 콜라보 컬럼 추가
ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS collab_id         UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS co_owner_name     TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS co_owner_avatar   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS co_owner_provider TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_tracks_co_owner ON public.tracks(co_owner_name, co_owner_provider);

-- ============================================================
-- 16. tracks duration 컬럼 추가 (재생시간 초 단위)
-- ============================================================
ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 0;
