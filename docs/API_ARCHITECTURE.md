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
│                    Vercel Serverless Functions (46개)                 │
│                                                                      │
│  ┌─ 음악/콘텐츠 ──────────────────────────────────────────────────┐  │
│  │ /api/kie          → kie.ai 프록시 (음악 생성)                   │  │
│  │ /api/kie-proxy    → kie.ai API 프록시 (키 보호+크레딧 검증)     │  │
│  │ /api/tracks       → 트랙 CRUD + 좋아요/별점 + 단건조회          │  │
│  │ /api/comments     → 댓글 CRUD (soft delete)                    │  │
│  │ /api/share        → OG 태그 공유 페이지                         │  │
│  │ /api/og-image     → OG 이미지 동적 생성                         │  │
│  │ /api/analyze      → Claude YouTube→Suno 프롬프트                │  │
│  │ /api/yt-analyze   → YouTube URL 분석                           │  │
│  │ /api/check-credit → 서버 크레딧 검증/차감                       │  │
│  │ /api/playlist     → 플레이리스트 CRUD                           │  │
│  │ /api/challenges   → 챌린지 CRUD                                │  │
│  │ /api/collabs      → 협업 모드                                   │  │
│  │ /api/my-feed      → 팔로잉 피드                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ 채팅 ────────────────────────────────────────────────────────┐  │
│  │ /api/chat             → 메시지 CRUD + 타이핑 + 고정 + 삭제    │  │
│  │ /api/realtime         → Supabase Realtime 연결 정보            │  │
│  │ /api/supabase-config  → anon key (Realtime 연결용)             │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ 인증/결제 ────────────────────────────────────────────────────┐  │
│  │ /api/users             → 유저 관리/로그인 기록                   │  │
│  │ /api/profile           → 프로필/팔로우/heartbeat/creators       │  │
│  │ /api/callback          → OAuth 콜백                            │  │
│  │ /api/managers          → 매니저 계정 CRUD                       │  │
│  │ /api/attendance        → 출석 체크                              │  │
│  │ /api/reports           → 신고 관리                              │  │
│  │ /api/toss-config       → 플랜 정의 (Single Source of Truth)     │  │
│  │ /api/payments/success  → 결제 성공 콜백                         │  │
│  │ /api/payments/webhook  → Toss 웹훅                             │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ AI 챗 ───────────────────────────────────────────────────────┐  │
│  │ /api/claude-chat       → Claude AI 대화 (한국어)               │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ 알림 ─────────────────────────────────────────────────────────┐  │
│  │ /api/telegram          → 텔레그램 메시지 발송                    │  │
│  │ /api/tg-webhook        → 텔레그램 봇 웹훅 (28개 명령)           │  │
│  │ /api/tg-report         → 단순 메시지 발송                       │  │
│  │ /api/tg-debug          → 환경변수 디버그                        │  │
│  │ /api/kakao-notify      → 카카오톡 나에게 보내기                  │  │
│  │ /api/kakao-webhook     → 카카오 오픈빌더 스킬서버                │  │
│  │ /api/kakao-talk        → 카카오 OAuth 토큰 관리                  │  │
│  │ /api/notify-manager    → 매니저 이메일 알림 (Resend)             │  │
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
│  │ /api/error-logs        → 에러 로그 기록/조회                    │  │
│  │ /api/sentry-proxy      → Sentry API 프록시                     │  │
│  │ /api/cron/healthcheck  → 일일 헬스체크                          │  │
│  │ /api/cron/status       → 30분 상태체크                          │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
      ┌──────────┐ ┌──────────┐ ┌──────────┐
      │ Supabase │ │ kie.ai   │ │ 외부 API  │
      │ (DB+RT)  │ │ (AI음악) │ │          │
      │          │ │          │ │ Toss     │
      │ tracks   │ │ generate │ │ Telegram │
      │ users    │ │ lyrics   │ │ Kakao    │
      │ comments │ │ extend   │ │ GitHub   │
      │ payments │ │ vocals   │ │ Vercel   │
      │ settings │ │ video    │ │ Resend   │
      │ chat_msg │ │ chat/llm │ │ Sentry   │
      │ chat_typ │ │          │ │          │
      │ follows  │ │          │ │          │
      │ notific. │ │          │ │          │
      │ managers │ │          │ │          │
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
                      │      └─→ OAuth → /api/callback → localStorage
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

로컬→서버 동기화:
[앱 시작] _loadMyTracks()
    └─→ 로컬에만 있는 트랙 → _saveTrackToServer (_sync: true)
         ├─→ 성공 → notifications 테이블 로그
         └─→ 실패 → 3초 후 1회 재시도 → 실패 로그
```

## 프로필 & 팔로우 API (`/api/profile`)

```
GET  ?name=&provider=                        → 프로필 + 곡 + 통계 (5쿼리 병렬)
GET  ?name=&provider=&action=following        → 팔로잉 목록 (병렬 쿼리)
GET  ?name=&provider=&action=followers        → 팔로워 목록 (병렬 쿼리)
GET  ?name=_&provider=_&action=batch-follow-check  → 전체 팔로우 상태 (1쿼리)
     &viewerName=&viewerProvider=
GET  ?action=creators                         → 전체 가입 사용자 목록 (게스트/매니저 제외)
GET  ?action=heartbeat                        → 접속 heartbeat (last_login 갱신)
POST {action:'follow/unfollow', followerName, followerProvider, followingName, followingProvider}
POST {action:'report/block/update-profile', ...}
```

### 성능 최적화 (2026-03-22)

```
Before (순차):
  users → tracks → followerCount → followingCount → isFollowing
  = 5 순차 쿼리 × 100~300ms = 0.5~1.5초

After (병렬):
  Promise.all([users, tracks, followerCount, followingCount, isFollowing])
  = 가장 느린 1쿼리 기준 ~0.3초

팔로우 상태 확인:
  Before: 크리에이터 N명 × /api/profile = N×5 DB 쿼리
  After:  batch-follow-check 1회 = 1 DB 쿼리
```

## 채팅 API (`/api/chat`)

```
GET  ?room=general&limit=80&since=timestamp
  → { messages, insight, typing, pinned }
  → typing: 4초 내 입력 중인 사용자 이름 배열

POST {content, userName, userProvider, userAvatar, room, reply_to}
  → 메시지 전송 + 답글 대상자에게 웹 푸시 알림

POST {action:'typing', userName, room}
  → chat_typing 테이블 upsert (4초 TTL)

POST {action:'pin', msgId}     → 메시지 고정
POST {action:'unpin'}          → 고정 해제
POST {action:'delete', msgId}  → 메시지 삭제

Realtime:
  Supabase chat_messages INSERT → WebSocket → 클라이언트 즉시 렌더
  연결 실패 시 → 1초 폴링 폴백
```

## 트랙 API 경량 모드 (`/api/tracks`)

```
GET ?public=true&limit=200&mode=creators
  → select: owner_name, owner_provider, owner_avatar, image_url, comm_likes, comm_plays, created_at
  → 페이로드 60~70% 감소 (select=* 대비)
  → MY탭 크리에이터 목록 전용

GET ?id=<trackId>
  → 단건 조회 (공유 링크 재생용)
```

## 팔로우 상태 동기화 흐름

```
[앱 시작]
  └─→ _loadSbTracks()
       └─→ 커뮤니티 트랙 로드 완료
            ├─→ _groupCreatorsFromTracks() → _myFeedCreators (프리로드)
            └─→ renderCommunity()
                 └─→ _loadCommFollowStates()
                      └─→ batch-follow-check API (1회)
                           └─→ _followStateCache{} + sessionStorage 백업

[팔로우 클릭]
  └─→ _creatorFollowToggle(btn)
       ├─→ POST /api/profile {action:'follow'}
       ├─→ _followStateCache[key] = true/false (즉시 갱신)
       ├─→ sessionStorage 백업 갱신
       └─→ document.querySelectorAll(...).forEach (모든 동일 유저 버튼 동기화)

[DOM 재생성 (폴링/리렌더)]
  └─→ innerHTML 재생성 시 _followStateCache 참조하여 초기 상태 반영
       └─→ _loadCommFollowStates() → 캐시 히트 → _applyFollowToBtn()
```
