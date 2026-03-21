# 커뮤니티 레이아웃 배치 규칙

> 커뮤니티 뷰(`community-view`)의 HTML 구조, 렌더링 분기, 아이템 구성 규칙을 정의합니다.

---

## HTML 구조 (위→아래)

```
community-view
├── comm-header          "커뮤니티" 타이틀
├── comm-search-wrap     검색 입력 + 초기화 버튼
├── comm-filter-row      필터 탭
│   ├── 🔥 전체 (all)           ← 기본 선택
│   ├── 👤 크리에이터 (creators)
│   ├── 👥 팔로잉 (following)
│   ├── 🎵 K-Pop (kpop)
│   ├── 🎤 Hip-Hop (hiphop)
│   ├── ☕ Lo-Fi (lofi)
│   ├── ⚡ Electronic (electronic)
│   └── 🎬 OST (ost)
├── comm-sort-row        정렬 (인기순/최신순/별점순/재생순) ← 크리에이터 모드 시 숨김
├── comm-trending-tags   트렌딩 태그                       ← 크리에이터 모드 시 숨김
├── comm-dj-row          AI DJ (Chill/Energy/Mood/Mix)     ← 크리에이터 모드 시 숨김
├── comm-hero-wrap       Featured Hero 영역
├── comm-section-lbl     섹션 라벨
└── comm-list            트랙 리스트
```

---

## 렌더링 분기

### 진입점: `renderCommunity(force)`

15곳 이상에서 호출됨 (탭 전환, 좋아요, 삭제, 실시간 알림 등).

```
renderCommunity()
├── _commActiveGenre === 'creators'
│   → sort-row/dj-row/trending 숨김
│   → 데이터 미로드 시 await _loadSbTracks()
│   → _renderCreatorList()
│   → return
│
└── 그 외 (all / following / 장르 필터)
    → sort-row/dj-row/trending 복원
    → _renderCommContent()
```

검색 입력(`input`)과 초기화(`clearCommSearch`)에서도 동일 분기 적용.

---

## 모드 A: 기본 모드 (전체 / 장르 필터)

`_renderCommContent(heroWrap, list)` 호출.

### 배치 순서

| 순서 | 영역 | 컨테이너 | 설명 |
|------|------|----------|------|
| 1 | **Featured Hero** | `comm-hero-wrap` | 좋아요 1위 트랙. 커버+재생버튼+좋아요/싫어요/댓글/가사 |
| 2 | **🏆 인기 차트** | `comm-list` 내부 | `otherTracks` 중 `likes*2+plays` 상위 5개 (3개 이상일 때만 표시) |
| 3 | **🎵 내가 만든 곡** | `comm-list` 내부 | 로그인 유저 본인 곡 (최신순 → 좋아요순) |
| 4 | **다른 트랙** | `comm-list` 내부 | 나머지 곡 (좋아요순) |

### 데이터 분리 로직

```
전체 트랙 (getCommTracks → 장르 필터 적용)
 └→ sorted (좋아요순)
     ├→ hero: 유효 오디오 있는 1위
     └→ rest
         ├→ myTracks: 내 곡 (최신순 → 좋아요순)
         └→ otherTracks: 다른 사람 곡
              └→ weekTracks: 인기 차트 Top 5 (likes*2+plays 순)
```

### 변경 감지

- `_commPrevSnapshot` JSON 비교 → 변경 없으면 DOM 갱신 스킵
- 첫 렌더(`isFirstRender`)이면 무조건 갱신

---

## 모드 B: 크리에이터 모드

`_renderCreatorList()` 호출. `comm-hero-wrap` 비움, `comm-list`에 렌더.

### 배치 순서

크리에이터별 그룹 반복:

```
┌─ 크리에이터 헤더 ──────────────────────────────────┐
│  [아바타] 🔵 Kenny LEE   🎵 5곡  ❤️ 12  [팔로우]  │ ← 클릭 → 프로필 뷰
├────────────────────────────────────────────────────┤
│  🎵 Sunset Vibes       ▶ 3  ❤️ 5                  │ ← 클릭 → 재생
│  🎵 Night Drive         ▶ 1  ❤️ 4                  │
│  🎵 Morning Coffee      ▶ 2  ❤️ 3                  │
└────────────────────────────────────────────────────┘

┌─ 크리에이터 헤더 ──────────────────────────────────┐
│  [아바타] 💬 김재현   🎵 3곡  ❤️ 8  [팔로우]        │
├────────────────────────────────────────────────────┤
│  🎵 하늘 아래서         ▶ 5  ❤️ 5                  │
│  🎵 비 오는 날          ▶ 2  ❤️ 3                  │
└────────────────────────────────────────────────────┘
```

### 정렬

- **크리에이터 순서**: 곡 수 많은 순 → 좋아요 합계 순
- **그룹 내 곡 순서**: 좋아요 많은 순

### 헤더 구성

- 아바타 (38px 원형)
- 프로바이더 아이콘 (🔵 Google / 💬 카카오 / 🟢 네이버)
- 이름 + MY 뱃지 (본인일 경우)
- 곡 수 / 좋아요 합계
- 팔로우 버튼 (로그인 + 타인일 때만 표시)

### 팔로우 상태 로드

- `_followStateCache` 캐시 우선 → 미스 시 `/api/profile` 비동기 조회
- 팔로우 토글 시 같은 유저의 모든 버튼 동기화 (헤더 + 트랙 아이템)

---

## 트랙 아이템 구조 (`_buildCommItem`)

모드 A와 모드 B 공통으로 사용하는 아이템 컴포넌트.

```
┌─ 커버이미지 ─┬─ 1열: 제목 + 재생시간 + NEW + MY ──────────┐
│   (48x48)    ├─ 2열: 아바타 + 유저명 + [팔로우] + ▶ · ❤️  │
│              └─ 3열: 장르 태그 (최대 2개)                   │
├── ▶ | 🤍 좋아요 | 💔 싫어요 | ★★★★★ | 💬 댓글 | ↗ 공유 ──┤
│   + 🚩 신고 (타인) 또는 🗑 삭제 (본인)                      │
└──────────────────────────────────────────────────────────┘
```

### 클릭 동작

| 대상 | 동작 |
|------|------|
| 아이템 전체 | `commPlaySb(sbId)` — 재생 |
| 유저명 | `openCreatorProfile(name, provider)` — 프로필 뷰 이동 |
| 팔로우 버튼 | `_creatorFollowToggle(btn)` — 팔로우/언팔 토글 |
| 각 액션 버튼 | 개별 기능 (좋아요/싫어요/별점/댓글/공유/신고/삭제) |

---

## 비동기 후처리

렌더 완료 후 실행되는 비동기 작업:

| 함수 | 대상 | 설명 |
|------|------|------|
| `_loadCommentCounts()` | 트랙 ID 배열 | 댓글 수 배지 업데이트 |
| `_loadCommDurations()` | 캐시 없는 트랙 | Audio 메타데이터로 재생시간 로드 |
| `_loadCommFollowStates()` | 팔로우 버튼 | `/api/profile` 조회 → 팔로잉 상태 반영 |

---

## UI 토글 규칙

| 요소 | 기본 모드 | 크리에이터 모드 |
|------|-----------|----------------|
| `comm-sort-row` | 표시 | 숨김 |
| `comm-dj-row` | 표시 | 숨김 |
| `comm-trending-tags` | 표시 | 숨김 |
| `comm-hero-wrap` | Featured Hero 렌더 | 비움 (`innerHTML=''`) |
| `comm-section-lbl` | "다른 트랙 (N곡)" | "크리에이터 (N명)" |

---

## CSS 클래스 요약

| 클래스 | 용도 |
|--------|------|
| `.comm-list-item` | 트랙 아이템 카드 |
| `.comm-creator-group` | 크리에이터 그룹 컨테이너 |
| `.comm-creator-header` | 크리에이터 헤더 (아바타+이름+팔로우) |
| `.comm-creator-avatar` | 크리에이터 아바타 (38px 원형) |
| `.comm-creator-follow-btn` | 크리에이터 헤더 팔로우 버튼 |
| `.comm-item-follow-btn` | 트랙 아이템 내 팔로우 버튼 |
| `.comm-featured` | Featured Hero 카드 |
| `.comm-reaction-sm` | 트랙 아이템 액션 버튼 |
| `.comm-reaction-btn` | Hero 액션 버튼 |

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `index.html` | 커뮤니티 HTML + CSS + JS 전체 |
| `api/profile.js` | 프로필 조회 / 팔로우·언팔로우 API |
| `api/setup-db.js` | `follows` 테이블 스키마 |
| `api/comments.js` | 댓글 CRUD API |
| `api/reports.js` | 신고 API |
