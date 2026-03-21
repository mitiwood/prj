# 2026-03-21 작업 내역

## 📋 리버스 엔지니어링 & 기획 리뷰

### 프로젝트 전체 분석
- 전체 앱 구조 리버스 엔지니어링 (프론트엔드/백엔드/DB/외부API)
- 텔레그램 봇 시스템 상세 분석 (5개 파일, 17개 명령어, 자동화 파이프라인)
- 기획 리뷰: 리텐션 & 수익화 진단 → 텔레그램 7파트 리포트 전송

### 치명적 문제 3가지 발견 및 해결
1. **플랜 검증이 클라이언트(localStorage)에서만 동작** → 서버 검증 API 추가
2. **checkPlanLimit()이 generate()에서 호출 안 됨** → 연결 완료
3. **플랜 정의 3곳 불일치** → Single Source of Truth 통합

---

## 💰 수익화 기반 구축

### 플랜 3단계 통합 (Single Source of Truth)
- `api/toss-config.js`: 4단계(free/basic/pro/unlimited) → **3단계(Free/Pro/Creator)**
- 각 플랜에 `limits` 필드 통합 (songs/mv/lyrics)
- `index.html` UI: 플랜 카드 4개 → 3개
- `index.html` JS: `PLAN_LIMITS`가 서버(`/api/toss-config`)에서 자동 동기화
- `_TOSS_PLANS`도 서버 응답으로 갱신
- 결제 성공 시 사용량 초기화 추가

### checkPlanLimit() → generate() 연결
- `generate()` 상단에 `checkPlanLimit('song')` 추가
- `generateMV()` 상단에 `checkPlanLimit('mv')` 추가
- YouTube 모드 `yt-gen-btn` 클릭에 `checkPlanLimit('song')` 추가
- `showUpgradePrompt()` 풀스크린 팝업으로 개선 (사용량 표시 + 다음 플랜 안내)

### 서버 크레딧 검증 API (신규)
- **`api/check-credit.js`**: Supabase에서 실제 트랙 수 카운트하여 plan/usage 검증
- 생성 전: 비동기 서버 검증 (`_serverCreditCheck`)
- 생성 후: 서버 크레딧 차감 (`_serverCreditDeduct`)
- plan_expires 만료 시 자동 다운그레이드
- Supabase 장애 시 클라이언트 체크로 폴백 (graceful degradation)

---

## 📊 사용량 명령어 통합

### 텔레봇 '사용량' 명령어 강화
- Supabase DB 통계 (트랙/유저/댓글/결제)
- 유저별 이번달 사용량 (상위 5명, 곡수/플랜/로그인 횟수)
- Claude API 상태 (정상/한도초과/키무효)
- kie.ai API 상태
- Toss Payments 모드 (TEST/LIVE)
- Vercel 최신 배포 정보
- 사이트 응답 속도
- **텔레그램 + 카카오톡 동시 전송** (동일 내용)

### 환경변수
- `ANTHROPIC_API_KEY` Vercel 환경변수 등록 완료

---

## ⚡ 실시간 알림 시스템 (신규)

### API
- **`api/live-notify.js`**: 실시간 알림 CRUD API
  - POST (관리자): 알림 생성 → Supabase + 텔레그램 + 카카오 동시 전송
  - GET `?since=timestamp`: 클라이언트 폴링 (새 알림 조회)
  - GET `?history=true`: 관리자 이력 조회
  - DELETE `?id=xxx`: 알림 삭제

### 프론트엔드 (index.html)
- 10초 폴링으로 새 알림 수신
- 토스트 팝업 표시 (상단 고정, 7초 후 자동 소멸)
- 게스트 포함 접속 중인 모든 사용자에게 즉시 노출
- 브라우저 Notification 권한 있으면 시스템 알림도 동시 표시

### 관리자 패널 (admin.html)
- ⚡실시간 알림 탭 추가
- 발송 폼: 아이콘 + 제목 + 내용
- 빠른 템플릿: 업데이트/이벤트/신기능/점검/챌린지
- 실시간 미리보기
- 발송 이력 테이블 (10초 자동 갱신)
- 삭제 기능

### DB 스키마
- `live_notifications` 테이블 추가 (supabase-schema.sql)

---

## 🎨 UI/UX 수정

### 데이모드 (라이트 테마)
- 테마 시스템 추가: 다크/라이트 전환
- 핑크/블루/그린 테마 제거 → 다크/라이트만
- 데이모드 CSS 변수 근본 수정 (acc 파란색→보라색 통일)
- 데이모드 버튼 색상 다크모드와 동일하게 통일
- 풀플레이어 데이모드 스타일 수정
- 커뮤니티탭 히어로 영역 배경 밝게
- 설정 화면 프로필/배경색 수정
- 생성 버튼 텍스트 그림자 추가
- 구독중 버튼 초록→보라 통일

### 미니플레이어
- 프로그레스바 상단→하단 이동

### 아이콘
- 이모지 → SVG 아이콘 교체 (세련된 아이콘 시스템)

### 게스트 모드
- 로그아웃 버튼 대신 로그인 버튼 표시
- 설정 프로필 버튼 통일

---

## 🤖 봇 시스템

### 텔레그램 봇
- 자연어 명령 인식 추가 (진행상황/PR/상태 등)
- 머지 자연어: 번호 없이 '머지'만 입력하면 최근 PR 자동 탐색
- 사용량/일간/주간 명령어 강화

### 카카오봇
- 카카오톡 나에게 보내기 알림 시스템 추가
- 챗봇 메시지 UI 개선 (TextCard, ListCard, QuickReplies)
- 사용량 메시지 텔레그램과 동일하게 통합
- 수정/머지 시 텔레그램 동시 알림

### GitHub Actions
- Claude Code Action 수정→PR→머지 전체 파이프라인 완성
- PR 알림 텔레그램+카카오 동시 전송
- `.github` 수정 금지 규칙 추가
- 매일 09:00 KST E2E QA 자동 테스트 + 봇 리포트

---

## 🐛 버그 수정

- Notification 미정의 에러 수정 (typeof 체크)
- 관리자 패널 `_origSwitchSec` 중복 선언 에러 수정
- 공유 시 이미지 별도 첨부 제거 (OG 링크만)
- 풀플레이어 재생 중 화면 흔들림 제거
- 이퀄라이저 scaleY 전환 + 중복 재생 방지
- XSS 방어 및 댓글 삭제 권한 체크
- 플레이리스트 추가 기능 수정
- 'no supported sources' 오디오 에러 수정
- 바텀시트 미니플레이어 중첩 방지
- 댓글 카운트 배치 API + TTL 캐시 최적화

---

## 📁 변경된 주요 파일

| 파일 | 변경 내용 |
|------|-----------|
| `api/toss-config.js` | 플랜 3단계 통합 (Single Source of Truth) |
| `api/check-credit.js` | 신규 — 서버 크레딧 검증 API |
| `api/live-notify.js` | 신규 — 실시간 알림 API |
| `api/tg-webhook.js` | 사용량 명령어 전체 서비스 통합 + 카카오 동시 전송 |
| `api/kakao-notify.js` | 카카오톡 알림 시스템 |
| `api/kakao-webhook.js` | 카카오봇 스킬서버 |
| `api/supabase-schema.sql` | live_notifications 테이블 추가 |
| `index.html` | 플랜 UI 3단계 + checkPlanLimit 연결 + 실시간 알림 폴링 + 데이모드 + 미니플레이어 |
| `admin/admin.html` | ⚡실시간 알림 탭 추가 |
| `.github/workflows/` | Claude Code Action + QA 자동 테스트 |

---

## 🔢 커밋 수

**총 68개 커밋** (2026-03-21)
