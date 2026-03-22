# 2026-03-22 작업 내역

> 커뮤니티 크리에이터 시스템 + 팔로우 + 신고 관리 + MY피드 고도화

---

## 커뮤니티 크리에이터 시스템

### 크리에이터 탭 추가
- 커뮤니티 필터에 `👤 크리에이터` 탭 신규 추가
- 초기: 유저 카드 리스트 → 유저별 곡 그룹핑 → **최종: 크리에이터 카드만 표시**
- 카드 구성: 아바타 + 프로바이더 아이콘 + 이름 + 곡 수 + 좋아요 합계 + 팔로우 버튼
- 정렬: 곡 수 많은 순 → 좋아요 합계 순

### 기본 리스트 생성자별 그룹핑
- "다른 트랙" 섹션: 플랫 나열 → 크리에이터별 카드로 그룹핑
- 섹션 라벨에 크리에이터 수 + 곡 수 표시 (예: `3명 · 12곡`)
- 카드 클릭 → 해당 유저 **좋아요 1위 곡 자동 재생** + 프로필 뷰 이동

### 인기 차트 순서 변경
- Featured Hero → **🏆 인기 차트** → 내 곡 → 다른 트랙 (크리에이터 카드)
- 인기 차트를 내 곡/다른 트랙 위에 배치

### 크리에이터 목록 안정화
- `renderCommunity()` 15곳 이상 호출 경로에서 크리에이터 뷰 덮어쓰기 방지
- 크리에이터 모드 시 데이터 로드 완료 후 렌더 (`await _loadSbTracks`)
- 정렬/DJ/트렌딩 UI 토글을 `renderCommunity()` 내부에서 일관 처리
- 검색/초기화 시에도 크리에이터 모드 분기 적용

---

## 팔로우 시스템

### 트랙 리스트 팔로우 버튼
- 각 트랙 아이템의 유저명 옆에 소형 팔로우 버튼 (`.comm-item-follow-btn`)
- 비동기 팔로우 상태 로드 + `_followStateCache` 캐시 적용
- 팔로우 토글 시 같은 유저의 **모든 버튼 동기화** (트랙 + 크리에이터 헤더)

### 크리에이터 카드 팔로우 버튼
- 크리에이터 카드에 팔로우 버튼 포함
- 크리에이터 헤더 팔로우 상태 비동기 갱신

---

## 신고 관리 고도화

### admin 신고 관리 Supabase 연동
- localStorage → Supabase `reports` 테이블 실시간 연동
- 필터 탭: 대기중 / 처리됨 / 무시됨 / 전체
- 통계 대시보드: 대기/처리/무시 카운트
- 처리/무시/삭제 API 연동 (`PATCH`, `DELETE`)

### 댓글 신고
- 댓글 항목에 🚩 신고 버튼 추가 (타인 댓글만 표시)
- `_reportComment()` 함수로 신고 접수

### 신고 API
- `api/reports.js` 신규 생성
- `GET` 목록 조회 / `PATCH` 상태 변경 / `DELETE` 삭제

---

## MY 피드 (라이브러리)

### MY 탭 추가
- 라이브러리에 `MY` 탭 신규 추가
- 커뮤니티 크리에이터 음악 모아보기

### MY 탭 고도화
- 크리에이터 뷰로 개편
- 정렬/검색 변수 추가 (`_myFeedSort`, `_myFeedSearch`)
- 라이트모드 대응, 트랙 액션, 뒤로가기 버튼

---

## 커뮤니티 10대 고도화

### 차트 시스템
- 주간 인기 차트 순위 변동 추적 (▲▼ NEW 뱃지)
- `_getChartRankChange()` — localStorage 기반 이전 순위 비교

### 추천 시스템
- `_buildRecommendations()` — 좋아요 기반 유사 트랙 추천
- "✨ 당신을 위한 추천" 캐러셀

### 활동 피드
- 최근 좋아요/댓글 활동 피드 표시

### 카드 리디자인
- 리믹스 체인 뱃지 (`comm-chain-badge`)
- Featured Hero 카드 개선

---

## UI 개선

### 트렌딩 태그 한 줄화
- `flex-wrap` → 가로 스크롤 한 줄로 변경
- 스크롤바 숨김 (webkit + scrollbar-width)
- 태그 버튼 `white-space:nowrap` + `flex-shrink:0`

### CSS 추가
- `.comm-creator-item` — 독립 크리에이터 카드 스타일
- `.comm-creator-group` — 크리에이터 그룹 컨테이너
- `.comm-creator-header` — 그룹 헤더
- `.comm-item-follow-btn` — 트랙 내 팔로우 버튼
- `.comm-creator-follow-btn.following` — 팔로잉 상태
- 다크/라이트 모드 양쪽 대응

---

## 문서화

### 신규 문서
- `docs/community-layout.md` — 커뮤니티 레이아웃 배치 규칙
- `docs/tab-structure.md` — 전체 탭 구조 (5개 뷰 + 오버레이)
- `docs/changelog-20260322.md` — 본 문서

### 신규 API
- `api/reports.js` — 신고 CRUD API

---

## MY탭 성능 최적화

### 서버 최적화 (api/)
- `profile.js`: 프로필 조회 5쿼리 → `Promise.all` 병렬 실행
- `profile.js`: followers/following N+1 → `Promise.all(list.map(...))` 병렬화
- `profile.js`: 배치 팔로우 체크 API 신설 (`?action=batch-follow-check`)
- `tracks.js`: `mode=creators` 경량 모드 추가 (7개 컬럼만 SELECT)

### 클라이언트 최적화 (index.html)
- 외부 이미지 차단 (`_mfBlockedHosts`) — pexels/unsplash 등 NS_BINDING_ABORTED 완전 해소
- 안전한 이미지 헬퍼 (`_mfAvatar`, `_mfThumb`, `_mfImgFail`) — onerror 이니셜 폴백
- 팔로우 상태 배치 로드 + 캐시 적용 (`_loadCommFollowStates` → 1회 API)
- 커뮤니티 로드 완료 시 크리에이터 프리로드 (탭 전환 즉시 표시)
- 초기 청크 10→20개 + IntersectionObserver 스크롤 자동 로드
- 모든 이미지 `loading="lazy"` 적용

### 결과
- MY탭 진입: 5~15초 → ~0ms (프리로드), 콜드 스타트 ~0.5초
- 크리에이터 상세: ~1.5초 → ~0.3초
- 팔로우 상태 표시: N×1초 → ~0.2초

---

## 팔로우 상태 풀림 버그 수정

### 원인
- tracks API 폴링으로 DOM 재생성(innerHTML) 시 팔로우 버튼이 항상 "팔로우"로 초기화
- `_loadCommFollowStates`가 `.comm-item-follow-btn`만 탐색, `.comm-creator-follow-btn` 누락
- 언팔로우 시 `cache[key]=false` → `if(cache[key])` 조건 false → 팔로잉 미복원

### 수정
- `_loadCommFollowStates`: 아이템 + 크리에이터 헤더 버튼 모두 선택
- `_applyFollowToBtn()`: `===true`(팔로잉) / `===false`(팔로우) 양방향 적용
- 모든 팔로우 버튼 생성 시 `_followStateCache` 참조하여 초기 상태 반영
- 적용 위치: `_renderCommContent`, `_renderCreatorList`, `_buildCommItem`, 팔로잉/팔로워 목록

---

## 커뮤니티 데이터 로딩 고도화

### 폴링 최적화
- 폴링 간격 10초 → **30초**로 변경 (불필요한 서버 요청 감소)
- 캐시 TTL 10초 → **30초** (`_SB_CACHE_TTL`)
- **Page Visibility API** 연동 — 브라우저 탭 비활성 시 폴링 완전 중단, 탭 복귀 시 캐시 만료 시 즉시 갱신

### 캐시 유효 시 서버 호출 스킵
- `renderCommunity(force=false)` + 캐시 유효 → 즉시 렌더, **API 0회**
- 탭 전환 시 `force=false`로 변경 — 30초 내 재방문 시 깜빡임 제로

### 부분 DOM 갱신 (`_commQuickRender`)
- 좋아요/싫어요 시 `renderCommunity()` 전체 리렌더 → **버튼+숫자만 인라인 갱신**
- 히어로: 좋아요 카운트, 버튼 상태, 배지 텍스트 부분 갱신
- 리스트: `data-sbid`로 해당 아이템 찾아 액션 버튼만 업데이트
- 실패 시 전체 리렌더 폴백

### renderCommunity 디바운스
- 100ms 내 연속 호출 병합 — 좋아요→싫어요 빠른 연타 시 1회만 렌더
- `_renderCommunityInner()`로 내부 로직 분리

### 스냅샷 비교 강화
- `ID+likes` → **`ID+likes+plays+dislikes+sortMode`**
- 정렬 모드 변경도 스냅샷에 포함

---

## Admin 패널 버그 수정

### 신고 로드 실패 수정
- **원인:** `switchSec('reports')` → `loadReports()` + `renderReportsAdmin()` 호출 — 둘 다 미정의 함수
- **수정:** `loadReportsFromDB()` 1회 호출로 교체
- 레거시 localStorage 기반 `loadReports`, `deleteReport`, `submitReport` 함수 제거

---

## 이미지 분석 기능 오류 수정

### 원인
- `KIE_CLAUDE_URL` 변수가 정의되지 않음 → `fetch(undefined)` → 에러
- kie.ai API 프록시 전환 시 이미지 분석 함수만 업데이트 누락

### 수정
- `fetch(KIE_CLAUDE_URL)` → `fetch('/api/kie-proxy')` + `path: KIE_LLM_PATH` (서버 프록시 경유)
- `kieApiKey` 클라이언트 체크 제거 (프록시가 서버에서 API 키 관리)
- 에러 응답 처리 추가 (`res.ok` 체크)

---

## 기타 수정

- `_getUser` 함수 미정의 에러 수정 (출석 체크 시스템)

---

## 커밋 목록

| 해시 | 내용 |
|------|------|
| `5408141` | MY 피드 탭 추가 |
| `8901257` | 크리에이터 탭 + 팔로우 버튼 + 인기차트 순서 |
| `8a6bf5c` | 크리에이터 목록 깜빡임 수정 |
| `8ce9dd3` | MY탭 크리에이터 뷰 개편 |
| `6f85916` | 크리에이터 탭 유저별 곡 그룹핑 |
| `7cb13d0` | 신고 Supabase 연동 + 댓글 신고 |
| `15f6a3e` | 신고 고도화 API |
| `4775d3a` | MY탭 크리에이터 뷰 고도화 |
| `b04dfa6` | 기본 리스트 생성자별 그룹핑 |
| `9093caf` | 크리에이터 카드만 표시 |
| `8eceea0` | 카드 클릭 시 1위 곡 재생 |
| `7e16fa8` | 커뮤니티 10대 고도화 |
| `11f31b3` | MY탭 2차 고도화 |
| `b8f261d` | 트렌딩 태그 한 줄 스크롤 |
