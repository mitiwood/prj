# 토스페이먼츠 결제 연동 가이드

> Kenny's Music Studio — 결제 시스템 설정 및 운영 가이드

---

## 현재 상태

| 항목 | 값 |
|------|-----|
| 연동 상태 | 테스트 모드 (실결제 안 됨) |
| 클라이언트 키 | `test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq` |
| 시크릿 키 | `test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R` |
| 실제 돈 빠짐 | 없음 |

> `test_` 키는 토스 공식 테스트 키로, 결제창은 뜨지만 가짜 결제만 처리됨

---

## 요금제 구조

| 플랜 | 가격 | 크레딧 | 주요 기능 |
|------|------|--------|-----------|
| Free | 무료 | 2곡/일 | 기본 장르, MP3 다운로드 |
| Basic | ₩4,900/월 | 30곡/월 | 전체 장르, MP3/WAV, 커뮤니티 공유 |
| Pro | ₩9,900/월 | 100곡/월 | MV 생성, 보컬 변환, 우선 큐 |
| Unlimited | ₩19,900/월 | 무제한 | 상업적 이용 라이선스, 최우선 큐 |

---

## 파일 구조

```
api/
├── toss-config.js          ← 클라이언트 키 + 플랜 정의 (GET)
├── payments/
│   ├── confirm.js          ← 결제 승인 API (POST) + 내역 조회 (GET)
│   ├── success.js          ← 결제 성공 리다이렉트 핸들러
│   └── webhook.js          ← 토스 웹훅 (취소/만료 처리)
└── supabase-schema.sql     ← payments 테이블 + users 컬럼 추가

index.html                  ← 요금제 카드 UI + 토스 SDK 연동
```

---

## 결제 흐름

```
1. 사용자가 설정 → 요금제에서 플랜 선택
2. "업그레이드" 버튼 클릭
   - 게스트: 로그인 유도 팝업 표시
   - 로그인 사용자: 토스 결제창 오픈
3. 토스 결제창에서 카드/토스페이/카카오페이 등 선택
4. 결제 성공 → /api/payments/success 로 리다이렉트
5. 서버에서 토스 승인 API 호출 (paymentKey, orderId, amount)
6. Supabase payments 테이블에 결제 내역 저장
7. Supabase users 테이블에 plan/credits/plan_expires 업데이트
8. 앱으로 리다이렉트 → "플랜 활성화됨" 토스트
```

---

## 테스트 방법

### 테스트 카드 정보
```
카드번호:  4330000000000009
유효기간:  아무거나 (예: 12/30)
CVC:       아무 3자리 (예: 123)
비밀번호:  아무 2자리 (예: 12)
```

### 테스트 순서
1. 앱 접속 → 소셜 로그인
2. 설정 탭 → 요금제 → Basic/Pro/Unlimited 중 "업그레이드" 클릭
3. 토스 결제창에서 테스트 카드번호 입력
4. 결제 완료 → 앱으로 돌아오며 플랜 활성화 확인

---

## 실결제 전환 방법

### Step 1. 토스페이먼츠 가입
1. https://developers.tosspayments.com 접속
2. 회원가입 (이메일)
3. 사업자 인증 (개인사업자/법인)
   - 개인사업자: 간이과세자도 가능
   - 홈택스에서 무료 발급 가능
4. 심사 승인 (1~3일)

### Step 2. 라이브 키 발급
- 심사 통과 후 **라이브 키** 발급됨
- `live_ck_xxxxxxxx` (클라이언트)
- `live_sk_xxxxxxxx` (시크릿)

### Step 3. Vercel 환경변수 등록
Vercel Dashboard → Settings → Environment Variables:

| 변수명 | 값 | 설명 |
|--------|-----|------|
| `TOSS_CLIENT_KEY` | `live_ck_xxxxxxxx` | 프론트엔드용 공개키 |
| `TOSS_SECRET_KEY` | `live_sk_xxxxxxxx` | 서버용 시크릿 (노출 금지) |
| `TOSS_WEBHOOK_SECRET` | (웹훅 설정 시 발급) | 선택사항 |

### Step 4. Supabase 스키마 업데이트
Supabase Dashboard → SQL Editor에서 실행:

```sql
-- users 테이블에 결제 컬럼 추가
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS plan_expires TIMESTAMPTZ;

-- payments 테이블 생성
CREATE TABLE IF NOT EXISTS public.payments (
  id              BIGSERIAL   PRIMARY KEY,
  order_id        TEXT        NOT NULL UNIQUE,
  user_name       TEXT,
  user_provider   TEXT,
  payment_key     TEXT        NOT NULL,
  amount          INTEGER     NOT NULL,
  plan            TEXT        NOT NULL,
  status          TEXT        DEFAULT 'DONE',
  method          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  approved_at     TIMESTAMPTZ
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_service_all ON public.payments
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_payments_order   ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user    ON public.payments(user_name, user_provider);
CREATE INDEX IF NOT EXISTS idx_payments_created ON public.payments(created_at DESC);
```

### Step 5. Vercel 재배포
환경변수 추가 후 Vercel → Deployments → 최신 배포 → Redeploy

### Step 6. 토스 웹훅 설정 (선택)
1. 토스 개발자센터 → 웹훅 설정
2. URL: `https://ai-music-studio-bice.vercel.app/api/payments/webhook`
3. 이벤트: 결제 취소, 만료 등

---

## 필요 서류 (실결제용)

| 서류 | 필수 | 비고 |
|------|------|------|
| 사업자등록증 | 필수 | 간이/일반 모두 가능 |
| 통신판매업 신고증 | 필수 | 구청에서 발급 |
| 통장 사본 | 필수 | 정산 입금 계좌 |
| 대표자 신분증 | 필수 | 심사용 |

---

## 주의사항

- `test_` 키: 테스트 전용, 실결제 불가
- `live_` 키: 실결제, 코드에 직접 넣지 말고 **반드시 환경변수로**
- 시크릿 키(`sk`)는 서버에서만 사용, 프론트엔드에 노출 금지
- 결제 승인은 반드시 서버에서 수행 (클라이언트에서 직접 승인 불가)
- 정산 주기: D+1 ~ D+3 (토스페이먼츠 기준)
