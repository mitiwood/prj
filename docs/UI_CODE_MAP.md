# UI 코드 맵 — 탭별 HTML/CSS/JS 위치

> 디자인 변경 시 참고하는 코드 위치 가이드

---

## 1. 음악 만들기 (create-view)

| 구분 | 파일 | 줄 번호 | 설명 |
|------|------|---------|------|
| HTML | `index.html` | 4882~5902 | 커스텀/심플/YouTube/MV 패널 |
| CSS | `index.html` | 380~780 | `.create-hero`, `.prompt-card`, `.gen-btn`, `.mode-tabs` 등 |
| JS (생성) | `index.html` | 10940~12700 | `generate()`, `pollResult()`, `renderTracks()` |
| JS (프리셋) | `js/create-enhance.js` | 전체 | 프리셋, 프롬프트 빌더, NLP, 품질 점수 |
| JS (모델) | `js/model-profiles.js` | 전체 | 모델 추천, A/B 테스트 |
| JS (프롬프트) | `js/prompt-engine.js` | 전체 | NLP 강화, 프롬프트 최적화 |

### 주요 CSS 클래스
- `.create-hero` — 상단 히어로 배너
- `.mode-tabs` — 커스텀/심플/YouTube/MV 탭
- `.prompt-card` — 가사 입력 카드
- `.prompt-area` — 가사 textarea
- `.gen-btn` — 생성 버튼
- `.opt-group` — 고급 설정 그룹
- `.result-card` — 생성 결과 카드
- `.loading-card` — 생성 중 로딩 오버레이

---

## 2. 라이브러리 (history-view)

| 구분 | 파일 | 줄 번호 | 설명 |
|------|------|---------|------|
| HTML | `index.html` | 5903~5999 | 탭 필터, 그리드, NAS 패널 |
| CSS | `index.html` | 1130~1250 | `.hist-card`, `.hist-thumb`, `.hist-view-grid` |
| JS (렌더링) | `index.html` | 13860~14400 | `renderHistoryView()`, 카드 생성, duration 로드 |
| JS (히스토리) | `js/history-manager.js` | 전체 | 검색, 필터, 통계, 내보내기 |

### 주요 CSS 클래스
- `.hist-view-grid` — 히스토리 그리드 컨테이너
- `.hist-view-grid.grid-mode` — 2~5열 그리드 모드
- `.hist-view-grid.full-mode` — 전체 카드 모드
- `.hist-card` — 개별 트랙 카드
- `.hist-thumb` — 앨범아트 썸네일
- `.hist-title` — 곡 제목
- `.hist-tabs` — 전체/내곡/음악/뮤비 탭
- `.hist-duration` — 재생시간 뱃지

---

## 3. 커뮤니티 (community-view)

| 구분 | 파일 | 줄 번호 | 설명 |
|------|------|---------|------|
| HTML | `index.html` | 6000~6062 | 정렬/필터, 곡 리스트, 인기차트 |
| CSS | `index.html` | 2900~3070 | `.comm-list`, `.comm-list-item`, `.comm-card` |
| JS (렌더링) | `index.html` | 21200~22000 | 커뮤니티 렌더링, 정렬, 좋아요/싫어요 |
| JS (채팅) | `index.html` | 22100~22500 | 실시간 채팅 |

### 주요 CSS 클래스
- `.comm-list` — 곡 리스트 컨테이너
- `.comm-list-item` — 개별 곡 행
- `.comm-list-thumb` — 썸네일
- `.comm-list-title` — 제목
- `.comm-list-duration` — 재생시간
- `.comm-sort-bar` — 정렬 바 (최신/인기/평점)
- `.comm-chat-wrap` — 채팅 영역
- `.comm-chat-input` — 채팅 입력

---

## 4. 설정 (settings-view)

| 구분 | 파일 | 줄 번호 | 설명 |
|------|------|---------|------|
| HTML | `index.html` | 6063~6500 | 프로필, 테마, 언어, 푸시, 출석, 플랜 등 |
| CSS | `index.html` | 3155~3220 | `.settings-section`, `.settings-item`, `.settings-banner` |
| JS (설정) | `index.html` | 23300~24000 | 테마, 언어, 알림 설정 |
| JS (출석) | `index.html` | 29626~29710 | `_initAttendance()`, `_renderAttendanceSettings()` |
| JS (플랜) | `index.html` | 24246~24500 | `checkPlanLimit()`, 크레딧 관리 |

### 주요 CSS 클래스
- `.settings-banner` — 상단 프로필 배너
- `.settings-section` — 설정 그룹
- `.settings-section-title` — 그룹 제목 (대문자)
- `.settings-item` — 개별 설정 행
- `.attendance-card` — 출석 체크 카드
- `.plan-banner` — 플랜 배너
- `.plan-card` — 플랜 선택 카드

---

## 5. 하단 탭 바

| 구분 | 파일 | 줄 번호 | 설명 |
|------|------|---------|------|
| HTML | `index.html` | 6714~6740 | nav 아이템 4개 |
| CSS | `index.html` | 3266~3295 | `#bottom-nav`, `.bnav-item` |
| JS | `index.html` | 7800~7870 | `switchTab()` |

### 주요 CSS
- `#bottom-nav` — 고정 하단 바
- `.bnav-item` — 탭 버튼
- `.bnav-item.on` — 활성 탭 (보라색)
- `.bnav-icon` — 탭 아이콘
- `.bnav-label` — 탭 라벨

---

## 6. 공통 요소

| 요소 | CSS 위치 | 설명 |
|------|---------|------|
| 미니플레이어 | 3096~3160 | `#mini-player` |
| 풀플레이어 | 3400~3600 | `.fp-wrap` |
| 토스트 | 3299~3310 | `#toast` |
| 바텀시트 | 4365~4385 | `.ai-sheet-overlay`, `.ai-sheet-box` |
| 모달 | 1260~1310 | `.modal-backdrop`, `.modal` |
| 테마 변수 | 148~175 | `--bg`, `--card`, `--t1`, `--acc` 등 |
| 라이트 테마 | 192~280 | `[data-theme="light"]` 오버라이드 |

---

## 7. CSS 테마 변수 (index.html:148~175)

```css
--bg: #0a0a14        /* 배경 */
--bg2: #12121f       /* 보조 배경 */
--card: #16152a      /* 카드 배경 */
--border: rgba(255,255,255,.06)  /* 테두리 */
--t1: #f1f0f5        /* 제목 텍스트 */
--t2: #a09ab8        /* 본문 텍스트 */
--t3: #6b6580        /* 보조 텍스트 */
--acc: #7c3aed       /* 메인 보라색 */
--acc2: #a855f7      /* 보조 보라색 */
--grn: #22c55e       /* 성공 초록 */
--red: #ef4444       /* 에러 빨강 */
--ylw: #f59e0b       /* 경고 노랑 */
```

---

## 8. 반응형 브레이크포인트 (index.html:4583~4660)

| 브레이크포인트 | 컨테이너 | 적용 |
|--------------|---------|------|
| ~480px | 480px | 모바일 기본 |
| 600px+ | 580px | 소형 태블릿 |
| 744px+ | 720px | 아이패드 미니 |
| 1024px+ | 960px | 데스크탑 |
| 1440px+ | 1200px | 와이드 |
