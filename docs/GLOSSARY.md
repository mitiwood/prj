# 용어 정리집 — 띵곡 AI Music Studio

> 수정 요청 시 커뮤니케이션을 위한 공통 용어 사전

---

## 화면 (View)

| 용어 | 코드 ID | 설명 |
|------|---------|------|
| **만들기** | `create-view` | 음악 생성 화면 (커스텀/심플/YouTube/MV) |
| **보관함** / 라이브러리 | `history-view` | 내 곡 목록, 히스토리 |
| **커뮤니티** | `community-view` | 공개곡 리스트, 인기차트, 채팅 |
| **설정** | `settings-view` | 테마, 언어, 푸시, 출석, 플랜 등 |
| **하단탭** / 바텀탭 | `#bottom-nav` | 하단 네비게이션 4개 버튼 |

---

## 생성 모드 (Mode)

| 용어 | 코드 값 | 설명 |
|------|---------|------|
| **커스텀** | `custom` | 장르/분위기/가사 직접 입력 생성 |
| **심플** | `simple` | 한줄 설명으로 원클릭 생성 |
| **유튜브** | `youtube` | YouTube URL 분석 → 유사곡 생성 |
| **뮤비** / MV | `mv` | 텍스트→영상 뮤직비디오 생성 |
| **연장** / Extend | `extend` | 기존 곡에서 이어지는 새 파트 생성 |
| **커버** | `cover` | 원곡 멜로디 유지 + 보컬 변경 |
| **리마스터** | `remaster` | V5 엔진으로 음질 업그레이드 |
| **보컬 제거** / VR | `vocal-removal` | 보컬/MR 분리 |
| **스템 분리** | `split_stem` | 14트랙 악기별 분리 |

---

## 플레이어 (Player)

| 용어 | 코드 ID | 설명 |
|------|---------|------|
| **미니플레이어** | `#mini-player` | 하단탭 위 떠있는 소형 플레이어 |
| **풀플레이어** | `.fp-wrap` | 전체 화면 플레이어 (가사/비주얼라이저) |
| **결과 카드 플레이어** | `.audio-player` | 생성 결과 내 인라인 플레이어 |
| **공유 플레이어** | `#shared-player-wrap` | QR/링크로 접근 시 바텀시트 플레이어 |
| **노래방 모드** | 카라오케 | 가사 하이라이트 싱크 재생 |

---

## 카드 / 리스트

| 용어 | 코드 클래스 | 설명 |
|------|------------|------|
| **히스토리 카드** | `.hist-card` | 보관함의 개별 트랙 카드 |
| **결과 카드** | `.result-card` | 생성 완료 후 표시되는 곡 카드 |
| **배치** / Batch | `.result-batch` | 결과 카드 묶음 (1~2곡) |
| **커뮤니티 행** | `.comm-list-item` | 커뮤니티 곡 리스트 한 줄 |
| **트랙** | track / historyData 항목 | 곡 1개 데이터 (id, title, audio_url 등) |

---

## 뷰 모드 (보관함)

| 용어 | 코드 값 | 설명 |
|------|---------|------|
| **리스트 모드** | 기본 | 한 줄씩 나열 (좌: 썸네일, 우: 정보) |
| **그리드 모드** | `grid-mode` | 2~5열 정사각형 썸네일 |
| **전체 모드** | `full-mode` | 큰 카드 + 앨범아트 전체 보기 |

---

## UI 요소

| 용어 | 코드 | 설명 |
|------|------|------|
| **토스트** | `#toast` | 하단 팝업 메시지 (2~3초 자동 사라짐) |
| **바텀시트** | `.ai-sheet-overlay` | 하단에서 올라오는 패널 |
| **모달** | `.modal-backdrop` | 화면 중앙 팝업 |
| **로딩카드** | `#loading-card` | 생성 중 프로그레스 오버레이 |
| **프롬프트** | `#prompt` / `.prompt-area` | 가사/설명 입력 영역 |
| **프리셋** | PRESETS_V2 | 장르별 미리 설정된 값 (K-Pop, 발라드 등) |
| **칩** | `.genre-btn` / `.mood-btn` | 선택 가능한 태그 버튼 |
| **뱃지** | `.badge` | 작은 라벨 (Pro, 연장, ON/OFF 등) |

---

## 기능

| 용어 | 설명 |
|------|------|
| **생성 큐** | 곡 생성 대기열 (최대 3곡) |
| **폴링** | 서버에 주기적으로 상태 확인 (생성 진행률) |
| **SSE** | Server-Sent Events (서버 → 클라이언트 실시간 푸시) |
| **콜백** | kie.ai 생성 완료 시 서버가 호출하는 웹훅 |
| **크레딧** | 곡 생성 횟수 (플랜별 월 한도) |
| **플랜** | 구독 등급 (free / pro / creator) |
| **출석 체크** | 매일 접속 시 보너스 크레딧 지급 |
| **스트릭** | 연속 출석 일수 |
| **A/B 테스트** | 같은 프롬프트를 2개 모델로 동시 생성 비교 |
| **경량 수정** | 텔레봇에서 Anthropic API 직접 호출 → GitHub 커밋 |
| **중량 수정** | GitHub Issue → Actions → Claude Code CLI 실행 |

---

## 모델

| 용어 | 설명 |
|------|------|
| **V3.5** | 빠른 생성, 기본 품질 |
| **V4** | 안정적 범용 모델 (권장) |
| **V4.5** | 보컬 품질 향상 |
| **V4.5+** | 8분 장곡 + 최고 품질 |
| **V5** | 최신 실험 모델 (audioWeight 파라미터) |
| **Lyria Pro** | Google 음악 AI (2분) |
| **Lyria Clip** | Google 음악 AI (30초) |

---

## 데이터

| 용어 | 코드 | 설명 |
|------|------|------|
| **historyData** | 전역 배열 | 로컬 곡 히스토리 (최대 50개) |
| **_sbTracks** | 전역 배열 | Supabase 서버 트랙 (커뮤니티) |
| **currentUser** | 전역 객체 | 로그인 사용자 정보 |
| **_serverCreditsCache** | 전역 객체 | 서버 크레딧 캐시 |
| **localStorage** | 브라우저 | 설정, 히스토리, 세션 등 로컬 저장 |
| **Supabase** | 서버 DB | 트랙, 유저, 좋아요, 출석 등 |

---

## API 엔드포인트

| 용어 | 경로 | 설명 |
|------|------|------|
| **kie 프록시** | `/api/kie-proxy` | kie.ai API 보안 프록시 |
| **트랙 API** | `/api/tracks` | 트랙 CRUD + 검색 + 통계 |
| **프로필** | `/api/profile` | 사용자 프로필 + 곡 목록 |
| **크레딧** | `/api/check-credit` | 크레딧 검증 + 차감 |
| **콜백** | `/api/callback` | kie.ai 생성 완료 웹훅 |
| **텔레그램** | `/api/telegram` | 텔레그램 봇 메시지 전송 |
| **카카오** | `/api/kakao-notify` | 카카오톡 알림 전송 |
| **출석** | `/api/attendance` | 출석 체크 + 보상 |
| **취향** | `/api/user-prefs` | 음악 취향 설정 |
| **YT 분석** | `/api/yt-analyze` | YouTube URL 분석 |
| **세션** | `/api/auth/session-check` | 세션 유효성 검증 |
| **GH 웹훅** | `/api/gh-webhook` | GitHub Actions 상태 알림 |

---

## 제스처

| 용어 | 동작 |
|------|------|
| **좌 스와이프** | 히스토리 카드 → 삭제 |
| **우 스와이프** | 히스토리 카드 → 좋아요 |
| **탭 스와이프** | 화면 좌/우 → 탭 전환 |
| **PTR** | Pull-to-Refresh (당겨서 새로고침) |
| **롱프레스** | 500ms 길게 누르기 → 퀵 메뉴 |
| **더블탭** | 커뮤니티 곡 2번 탭 → 좋아요 |

---

## 파일 구조

| 용어 | 경로 | 설명 |
|------|------|------|
| **메인 페이지** | `index.html` | HTML + CSS + JS 통합 |
| **관리자** | `admin/admin.html` | 관리자 대시보드 |
| **서버리스 API** | `api/*.js` | Vercel 서버리스 함수 |
| **크론** | `api/cron/*.js` | 정기 실행 작업 |
| **JS 모듈** | `js/*.js` | 프론트엔드 모듈 |
| **워크플로우** | `.github/workflows/` | GitHub Actions |
| **문서** | `docs/*.md` | 프로젝트 문서 |

---

## 약어

| 약어 | 풀네임 |
|------|--------|
| **KMS** | Kenny's Music Studio |
| **PTR** | Pull-to-Refresh |
| **SSE** | Server-Sent Events |
| **SW** | Service Worker |
| **VR** | Vocal Removal |
| **MV** | Music Video |
| **TC** | Test Case |
| **QA** | Quality Assurance |
| **NAS** | Network Attached Storage |
| **JWT** | JSON Web Token |
| **VAPID** | Voluntary Application Server Identification |
