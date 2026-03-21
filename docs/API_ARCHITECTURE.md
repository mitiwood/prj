# API 구조도

## 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                        클라이언트 (index.html)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ 만들기    │ │ 커뮤니티  │ │ 보관함   │ │ 설정     │ │ 플레이어  │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ │
└───────┼────────────┼────────────┼────────────┼────────────┼────────┘
        │            │            │            │            │
        ▼            ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Vercel Serverless Functions (30개)                 │
│                                                                      │
│  ┌─ 음악/콘텐츠 ──────────────────────────────────────────────────┐  │
│  │ /api/kie          → kie.ai 프록시 (음악 생성)                   │  │
│  │ /api/tracks       → 트랙 CRUD + 좋아요/싫어요/별점              │  │
│  │ /api/comments     → 댓글 CRUD (soft delete)                    │  │
│  │ /api/share        → OG 태그 공유 페이지                         │  │
│  │ /api/analyze      → Claude YouTube→Suno 프롬프트                │  │
│  │ /api/yt-analyze   → YouTube URL 분석                           │  │
│  │ /api/check-credit → 서버 크레딧 검증/차감                       │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ 인증/결제 ────────────────────────────────────────────────────┐  │
│  │ /api/users             → 유저 관리/로그인 기록                   │  │
│  │ /api/auth/google       → Google OAuth                          │  │
│  │ /api/auth/kakao        → Kakao OAuth                           │  │
│  │ /api/auth/naver        → Naver OAuth                           │  │
│  │ /api/toss-config       → 플랜 정의 (Single Source of Truth)     │  │
│  │ /api/payments/success  → 결제 성공 콜백                         │  │
│  │ /api/payments/webhook  → Toss 웹훅                             │  │
│  │ /api/managers          → 매니저 계정 CRUD                       │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ 알림 ─────────────────────────────────────────────────────────┐  │
│  │ /api/telegram          → 텔레그램 메시지 발송                    │  │
│  │ /api/tg-webhook        → 텔레그램 봇 웹훅 (26개 명령)           │  │
│  │ /api/kakao-notify      → 카카오톡 나에게 보내기                  │  │
│  │ /api/kakao-webhook     → 카카오 오픈빌더 스킬서버                │  │
│  │ /api/live-notify       → 실시간 알림 (폴링)                     │  │
│  │ /api/announcement      → 인앱 공지 팝업                         │  │
│  │ /api/push-subscribe    → 웹 푸시 구독                           │  │
│  │ /api/push-send         → 웹 푸시 발송                           │  │
│  │ /api/push-history      → 푸시 히스토리                          │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ 시스템 ───────────────────────────────────────────────────────┐  │
│  │ /api/config            → KIE API 키 전달                       │  │
│  │ /api/setup-db          → DB 테이블 확인/생성                    │  │
│  │ /api/logs              → Vercel 배포 로그                       │  │
│  │ /api/claude-usage      → Claude API 상태                       │  │
│  │ /api/vapid-keys        → VAPID 공개키                          │  │
│  │ /api/notify-manager    → 매니저 이메일 알림                     │  │
│  │ /api/cron/healthcheck  → 일일 헬스체크                          │  │
│  │ /api/cron/status       → 30분 상태체크                          │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
      ┌──────────┐ ┌──────────┐ ┌──────────┐
      │ Supabase │ │ kie.ai   │ │ 외부 API  │
      │ (DB)     │ │ (AI음악) │ │          │
      │          │ │          │ │ Toss     │
      │ tracks   │ │ generate │ │ Telegram │
      │ users    │ │ lyrics   │ │ Kakao    │
      │ comments │ │ extend   │ │ GitHub   │
      │ payments │ │ vocals   │ │ Vercel   │
      │ settings │ │ video    │ │ Resend   │
      │ live_    │ │ chat/llm │ │          │
      │ notif.   │ │          │ │          │
      └──────────┘ └──────────┘ └──────────┘
```

## 인증 흐름도

```
                    ┌─────────────────┐
                    │   클라이언트     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  인증 필요?      │
                    └────────┬────────┘
                      ┌──────┼──────┐
                      ▼      ▼      ▼
                   공개API  유저API  관리자API
                   (인증X)  (OAuth) (Bearer)
                      │      │      │
                      │      │      └─→ Authorization: Bearer {ADMIN_SECRET}
                      │      │
                      │      └─→ OAuth → /api/auth/{provider} → callback → localStorage
                      │
                      └─→ /api/tracks(GET), /api/announcement(GET), /api/toss-config
```

## 데이터 흐름

```
생성 → 저장 → 알림

[프론트] kieRequest()
    │
    ▼
[kie.ai] POST /api/v1/generate → taskId
    │
    ▼ (폴링 30~60초)
[kie.ai] GET /api/v1/generate/record-info → tracks[]
    │
    ▼
[프론트] renderTracks() + historyData.unshift()
    │
    ├─→ localStorage (kms_history)
    ├─→ /api/tracks POST → Supabase INSERT
    │                        │
    │                        ├─→ _tgNotify() → Telegram
    │                        └─→ _kakaoNotify() → KakaoTalk
    │
    └─→ trackUsage() → localStorage (kms_usage_YYYYMM)
         └─→ _serverCreditDeduct() → /api/check-credit
```
