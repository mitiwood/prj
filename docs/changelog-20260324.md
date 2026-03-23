# Changelog — 2026-03-24 작업 내역

> 이 세션에서 수행한 모든 작업을 카테고리별로 정리한 문서입니다.

---

## 1. Sentry 에러 모니터링 통합

### 어드민 대시보드
- `admin/admin.html`에 **🛡️ Sentry 섹션** 신규 추가
- 통계 카드 3개: 미해결 이슈 수, 24h 이벤트 수, 최다 발생 이슈
- 24시간 이벤트 추이 바 차트 (심각도별 색상)
- 미해결 이슈 목록 (레벨 뱃지, 이벤트 수, 시간 정보)
- 이슈 상세 모달 (최근 이벤트, 태그, Sentry 링크)
- null 체크 추가 — `textContent` TypeError 방지

### API 프록시
- `api/sentry-proxy.js` 신규 생성
- `GET ?action=issues` — 미해결 이슈 목록
- `GET ?action=stats` — 24시간 이벤트 통계
- `GET ?action=issue&id=XX` — 이슈 상세
- `GET ?action=summary` — 봇용 요약

### 텔레그램 봇 연동
- `/센트리`, `/sentry`, `/에러현황` 명령어 추가
- 미해결 이슈 목록 + 레벨/시간 표시
- 헬스체크에 Sentry 연결 상태 항목 추가

### 환경변수
- `SENTRY_AUTH_TOKEN` Vercel에 등록
- `SENTRY_ORG=kenny-17`, `SENTRY_PROJECT=javascript`

---

## 2. 커뮤니티 데이터 정리 및 최적화

### 더미 데이터 제거
- DB에서 `seed_*` 더미 트랙 24건 삭제 (하늘별, 루나뮤직 등 10명)
- DB에서 `dummy_*` 아이돌 트랙 24건 삭제 (카리나, 윈터, 아이유 등 11명)
- 관련 팔로우 70건 삭제
- 크리에이터 정렬에서 `dummy_` prefix 우선순위 로직 제거

### 쓰레기 데이터 정리
- 오디오 없는 트랙 7건 삭제
- `example.com` 더미 오디오 트랙 7건 삭제
- 최종: **공개 트랙 75곡** — 전부 실제 생성 오디오

### 로딩 최적화
- 페이지 로드 시 커뮤니티 트랙 프리로드 **제거** → 탭 진입 시로 지연
- localStorage 캐시(`kms_comm_cache`, `kms_myfeed_creators`) **완전 제거**
- 메모리 캐시만 사용 — 깜빡임 방지
- 캐시 TTL 30초 → **5분** 확대
- 폴링 간격 30초 → **60초**
- 메모리에 데이터 있으면 **0ms 즉시 렌더** + 백그라운드 갱신

---

## 3. 트랙 저장/동기화 버그 수정 (크리티컬)

### co_owner_name 컬럼 부재 — GET 전체 실패
- `api/tracks.js` GET에서 `co_owner_name` 컬럼 참조 → Supabase 400 에러
- **모든 사용자의 트랙 조회가 메모리 폴백**으로 떨어짐
- owner 필터에서 미존재 컬럼 참조 제거로 해결

### parent_id/co_owner 컬럼 부재 — POST 전체 실패
- `api/tracks.js` POST에서 `parent_id`, `collab_id`, `co_owner_*` 컬럼 참조
- **모든 트랙 저장이 Supabase에 안 되고 메모리에만 저장**
- 서버 재시작 시 날아감 → 관리자에 안 보임
- 미존재 컬럼 제거로 해결

### 로컬→서버 트랙 동기화
- `_loadMyTracks`에서 로컬에만 있는 트랙을 서버에 자동 동기화
- `_saveTrackToServer` 실패 시 3초 후 1회 자동 재시도
- 동기화 시 `_sync: true` 플래그 → 서버에서 `notifications` 테이블에 로그 기록
- 저장 실패 시에도 실패 로그 기록

### 히스토리 뷰 갱신 누락
- `_loadMyTracks` 완료 후 `renderHistoryView()` 호출 누락 수정
- 서버에만 트랙이 있는 사용자(김재현 등)의 곡 목록 표시 복구

---

## 4. 팔로우 기능 DB 연동 강화

### 팔로우 풀림 현상 해결
- `_applyFollowToBtn`에서 `undefined`도 "팔로우 안 함"으로 처리
- `batch-follow-check` 후 모든 버튼에 명시적 `true/false` 설정
- 캐시 TTL 5분 — 유효하면 DB 재조회 스킵
- **sessionStorage에 팔로우 캐시 백업** — 새로고침 후 즉시 복원
- 커뮤니티 탭 진입 시 `_preloadFollowStates()` 프리로드

### 추천 크리에이터 동기화
- 추천 크리에이터 버튼을 `comm-creator-follow-btn`으로 통일
- `_creatorFollowToggle` 공유 → 전체 버튼 동기화
- 이미 팔로우한 크리에이터는 "팔로잉" 상태로 표시

### 크리에이터 목록 중복 코드 통합
- 별도 배치 로드 코드를 `_loadCommFollowStates`로 통합
- `_followBatchLoadedAt` 갱신 누락 수정

---

## 5. 관리자 페이지 고도화

### 모바일 반응형 대폭 보강
- 통계 카드, 차트, 테이블, 모달 모바일 최적화
- 버튼/필터/감사로그/에러모니터/Sentry 모바일 사이즈 조정
- 초소형 모바일(≤400px) 별도 대응
- 테이블 수평 스크롤 + 7번째 이후 컬럼 숨김
- safe-area-inset 지원

### 모바일 플로팅 메뉴 (FAB)
- 우하단 플로팅 ☰ 버튼으로 드로어 메뉴 열기
- 열면 ✕(빨간색)로 전환 + 배경 blur 오버레이
- 스크롤 다운 시 축소/투명, 스크롤 업 시 복원
- PC 사이드바는 기존 그대로 유지

### 음악관리 상세 모달 고도화
- 통계 카드 4열 (좋아요/싫어요/재생수/평점)
- 비디오 플레이어 추가 (MV 있는 경우)
- 메타 정보 섹션 (Track ID, Task ID, 모드, 공개상태)
- 공개/비공개 전환 버튼
- 다운로드 버튼
- 소유자 프로필 바로가기
- 생성 모드 라벨 확장 (커버/리마스터/스타일/보컬변경)
- 시간 ago 표시 (3시간 전 등)

### 음악관리 30초 자동 갱신
- 음악관리 탭 열려있으면 30초마다 서버에서 최신 트랙 자동 갱신
- 다른 사용자가 곡 생성해도 자동 반영

### 사용자 상세 시스템 로그
- 사용자 클릭 → 상세 모달에 📋 시스템 로그 섹션 추가
- `notifications` 테이블의 `type=system` 로그 조회
- 트랙 동기화 완료/실패 이력 확인 가능

---

## 6. 음악 생성 버그 수정 (크리티컬)

### 심플→커스텀 전환 시 500자 초과 에러
- kie.ai non-custom mode 500자 제한에 걸림
- prompt 400자 초과 시 자동으로 `customMode: true` 전환
- 422/exceed 에러는 자동 재시도 대상에서 제외

### 무한 "생성 중" 탈출
- 생성 중 팝업에 **⛔ 강제 취소** 버튼 추가
- `_globalGenerating` 리셋 + 로딩 해제

---

## 7. 기타 수정사항

### 음악만들기 NEW 배지
- 추가 후 위치 조정 시도 → 사용성 문제로 **최종 제거**
- CSS + JS + sessionStorage 코드 완전 정리

---

## 파일 변경 요약

| 파일 | 변경 |
|------|------|
| `admin/admin.html` | Sentry 섹션, 모바일 반응형, FAB, 음악관리 고도화, 시스템 로그 |
| `api/sentry-proxy.js` | 신규 — Sentry API 프록시 |
| `api/tracks.js` | co_owner/parent_id 컬럼 제거, 동기화 로그, POST/GET 수정 |
| `api/tg-webhook.js` | Sentry 명령어, 헬스체크 항목 추가 |
| `index.html` | 커뮤니티 최적화, 팔로우 DB 연동, 트랙 동기화, 생성 버그 수정 |
