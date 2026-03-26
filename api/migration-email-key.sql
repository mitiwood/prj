-- ============================================================
-- 마이그레이션: 사용자 식별자를 name+provider → email+provider로 전환
-- Supabase SQL Editor에서 실행
-- ============================================================

-- 1. 중복 사용자 병합 (같은 email+provider인데 name이 다른 레코드)
-- 가장 최근 로그인한 레코드만 남기고 나머지 삭제
DELETE FROM public.users a
USING public.users b
WHERE a.email = b.email
  AND a.provider = b.provider
  AND a.email <> ''
  AND a.id < b.id;

-- 2. 기존 UNIQUE 제약 제거
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_name_provider_key;

-- 3. 새 UNIQUE 제약 추가 (email+provider)
-- email이 빈 문자열인 경우를 위해 partial unique index 사용
ALTER TABLE public.users ADD CONSTRAINT users_email_provider_key UNIQUE(email, provider);

-- 4. tracks 테이블에 owner_email 컬럼 추가
ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS owner_email TEXT DEFAULT '';

-- 5. 기존 tracks에 owner_email 채우기 (users 테이블에서 매칭)
UPDATE public.tracks t
SET owner_email = u.email
FROM public.users u
WHERE LOWER(t.owner_name) = LOWER(u.name)
  AND LOWER(t.owner_provider) = LOWER(u.provider)
  AND u.email <> ''
  AND (t.owner_email IS NULL OR t.owner_email = '');

-- 6. owner_email 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_tracks_owner_email ON public.tracks(owner_email, owner_provider);
