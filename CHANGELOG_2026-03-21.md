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

## 🎵 음악 만들기 고도화 (Week 1~4 전체 구현)

### Week 1 — 생성 품질 + 초보자 진입
- `buildOptimalPrompt()`: 장르/무드/악기/BPM을 구조화된 프롬프트로 변환
- 프리셋 10개 원클릭 캐러셀 (K-Pop/발라드/힙합/로파이/EDM/R&B/록/재즈/시네마틱/어쿠스틱)
- duration 미지원 안내 + "자동" 버튼 + extend 연결 유도

### Week 2 — 사용자 선택권 확대
- A/B 비교 UI: 2곡 반환 시 A/B 라벨 + 비교 안내 배너
- 가사 에디터 강화: [Verse]/[Chorus]/[Bridge]/[Outro] 섹션 태그 버튼 + 글자수/줄수/언어 감지
- 심플→커스텀 전환 버튼: 파라미터 이관

### Week 3 — 기능 깊이
- 생성 실패 자동 재시도 (1회, 민감단어/크레딧 제외)
- 연장 체인: 히스토리 저장 + 체인 관계 표시 + 사용량 추적
- 리믹스 모드: recompose에 장르 변경 프리셋 6개 (K-Pop/EDM/Lo-Fi/Acoustic/Hip-Hop/Orchestral)

### Week 4 — 차별화
- 보컬 라이브러리 프리셋 6종 (걸그룹/R&B남/발라드여/록남/인디여/래퍼)
- 참조 아티스트 자동완성 datalist (30명)
- AI 작곡 어시스턴트: gemini-2.5-flash 대화형 추천 → 심플 모드 자동 적용

---

## 🎨 Suno 스타일 UI/UX 전면 개선

- SVG 아이콘 Lucide/Phosphor 스타일 업그레이드
- 라이브러리(보관함) Suno 스타일 최근생성 뷰 대폭 개선
- 라이브러리 편집 바텀시트 전면 개편
- 커뮤니티 리스트 3열 구조 재구성 (제목+시간 / 사용자 / 스타일)
- 커뮤니티 재생버튼 ↔ 미니플레이어 동기화 (▶/⏸ 토글)
- 미니플레이어 프로그레스바 상단→하단 이동
- 풀플레이어 데이모드 라이트 스타일 적용
- 탭 전환 시 열린 바텀시트/팝업/오버레이 전부 닫기
- 로딩 안내 문구 MZ톤으로 전면 변경

---

## 🎤 리믹스 & 커버 기능

- 리믹스 4종 완전 구현 (연장/커버/스타일재사용/리마스터)
- 커버 모달 → 바텀시트 + 스타일 추천 칩
- 커버 생성 시 음악만들기 탭 이동 + 로딩 포커스
- add-vocals 필수 파라미터 누락 수정
- negativeTags null 에러 수정

---

## 🤖 AI 추천 시스템

- 심플모드 추천 버튼: 시간/공간+감정/상태+질감/색채 컨셉 기반
- 로컬 랜덤 컨셉 풀 (API 의존 제거 → 즉시 생성)
- 곡 제목 자동 생성 및 입력폼 적용
- 곡 설명 한글 번역하여 적용

---

## 📖 문서 & 스킬

- `SPEC.md`: 기능 명세서 작성 (566줄, 15개 섹션)
- `KIE_API_REFERENCE.md`: docs.kie.ai 공식 문서 기반 전면 재작성
- `/kie` 스킬: 자연어로 API 레퍼런스 조회 (CLI + 텔레봇 + 카카오봇)
- 텔레봇/카카오봇 `kie` 명령어: GitHub API 인증으로 private 레포 접근

---

## 🔗 카카오 공유 수정

- Kakao JS SDK v2.7.4 로드 + KAKAO_JS_KEY 자동 초기화
- 카카오스토리 OpenAPI 종료 대응: story.kakao.com 참조 완전 제거
- 3단계 폴백: SDK → 링크복사 + 안내
- 풀플레이어 카카오 공유도 동일 패턴 적용

---

## 🚨 치명적 버그 수정

### switchView 미정의 에러
- `switchView` → `switchTab` 전체 교체 (3곳)
- 리믹스 연장/커버/스타일 버튼의 미존재 요소 참조 수정

### 텔레그램 알림 누락 (전체 API)
- **근본 원인:** `parse_mode: "Markdown"`에서 URL의 `()`, `_` 등이 파싱 에러
- 에러가 조용히 무시 → 알림이 안 오는 것으로 보임
- **수정:** 9개 API 파일에서 Markdown 제거 → plain text 전송
  - tracks.js, users.js, announcement.js, comments.js
  - tg-report.js, tg-debug.js, telegram.js
  - cron/healthcheck.js, cron/status.js, payments/success.js

### 에러 모니터링 강화
- window.onerror + unhandledrejection → 텔레그램+카카오 동시 알림
- 5초 쿨다운 도배 방지
- parse_mode: '' → 'HTML' + HTML 이스케이프

---

## 📁 변경된 주요 파일 (추가)

| 파일 | 변경 내용 |
|------|-----------|
| `index.html` | 음악 고도화(프리셋/프롬프트/A-B/가사에디터/리믹스/보컬/AI어시스턴트) + Suno UI + 커뮤니티 3열 + 재생동기화 + 에러알림 |
| `api/tracks.js` | Markdown 제거 + 에러 로깅 |
| `api/users.js` | Markdown 제거 |
| `api/telegram.js` | 기본 Markdown 폴백 제거 |
| `api/config.js` | KAKAO_JS_KEY 반환 추가 |
| `api/tg-webhook.js` | kie 명령어 + GitHub API 인증 |
| `api/kakao-webhook.js` | kie 명령어 + GitHub API 인증 |
| `KIE_API_REFERENCE.md` | 공식 문서 기반 전면 재작성 |
| `SPEC.md` | 기능 명세서 (신규) |
| `.claude/commands/kie.md` | /kie 스킬 (신규) |

---

## 🔢 커밋 수

**총 110+ 커밋** (2026-03-21)
