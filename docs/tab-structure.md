# 전체 탭 구조

> 앱의 모든 뷰(탭)와 하위 구성요소를 정의합니다.
> 하단 네비게이션 4개 탭 + 서브 뷰 1개 + 오버레이 컴포넌트.

---

## 하단 네비게이션 (`#bottom-nav`)

| 순서 | data-view | 아이콘 | 라벨 | 기본 상태 |
|------|-----------|--------|------|-----------|
| 1 | `community-view` | 사람들 | 커뮤니티 | - |
| 2 | `create-view` | 음표 | 음악 만들기 | **기본 활성 (on)** |
| 3 | `history-view` | 폴더 | 라이브러리 | - |
| 4 | `settings-view` | 설정 | 설정 | - |

서브 뷰: `profile-view` (커뮤니티 하위, 탭바에서 community-view 활성 유지)

---

## 1. 음악 만들기 (`#create-view`)

기본 활성 탭. 4개 모드 패널 + 로딩 + 결과 + 피드백.

```
create-view
├── create-hero               "새 곡 만들기" 타이틀
├── mode-tabs                 모드 탭 (4개)
│   ├── ✦ 커스텀 (custom)     ← 기본 활성
│   ├── ⚡ 심플 (simple)
│   ├── ▶ YouTube (youtube)
│   └── 🎬 MV (mv)
├── preset-carousel           프리셋 캐러셀 (원클릭 작곡)
│   └── K-Pop걸그룹 / 발라드 / 힙합 / 로파이 / EDM / R&B / 록 / 재즈 / 시네마틱 / 어쿠스틱
├── prompt-card               모드별 입력 패널 래퍼
│   ├── panel-custom          커스텀 패널
│   ├── panel-simple          심플 패널
│   ├── panel-youtube         YouTube 패널
│   └── panel-mv              MV 패널
├── loading-card              생성 중 로딩 UI
├── results-custom            커스텀 결과
├── results-simple            심플 결과
├── results-youtube           YouTube 결과
├── results (레거시)          기존 결과 영역
├── results-mv                MV 결과
└── feedback-card             피드백 / 재작곡 카드
```

### 1-1. 커스텀 패널 (`#panel-custom`)

가장 세밀한 설정. 전문가용.

```
panel-custom
├── 장르/스타일              genre-btn-grid (8개 카테고리) + sub-genre-row
├── 곡 제목                  song-title (선택)
├── AI 스타일 도구           트렌드 / AI스타일 / 이미지 분석
├── 분위기 + 인스트루멘탈    mood 셀렉트 + inst-toggle
├── 가사                     prompt textarea
│   ├── 구조 태그 삽입       Verse / Chorus / Bridge / Outro
│   ├── 글자수/줄수 정보     lyrics-info
│   ├── 빠른 작사            stream-lyrics-btn
│   ├── AI 자동 작사         lyrics-btn
│   └── 가사 미리보기        lyrics-preview-wrap
├── BPM 슬라이더            60~200, AUTO 지원
├── 보컬 성별               자동 / 남성 / 여성
├── 고급 설정 (접이식)
│   ├── 곡 시간              자동 / ~1분 / ~2분
│   ├── AI 모델              V3.5 / V4 / V4.5 / V4.5+ / V5
│   ├── 가사 언어            자동 / 한/영/일/중
│   ├── 악기/사운드          피아노/기타/신스/바이올린/베이스/드럼/색소폰/합창
│   ├── 레퍼런스 아티스트    텍스트 입력 + 분석 + datalist
│   ├── Negative Tags        제외 태그 입력
│   └── 슬라이더             스타일 강도 / 창의성
├── MV 자동 생성 토글       mv-toggle
└── 생성 버튼               gen-btn "✦ 음악 생성하기"
```

### 1-2. 심플 패널 (`#panel-simple`)

간편 모드. 최소 입력으로 빠른 생성.

```
panel-simple
├── AI 작곡 어시스턴트       자연어 입력 → 추천
├── 곡 제목                  simple-song-title (선택)
├── 곡 설명                  simple-prompt (자유 텍스트)
├── BPM 슬라이더            60~200
├── 분위기 + 인스트루멘탈    simple-mood + simple-inst-toggle
├── 가사                     simple-lyrics + AI 자동 작사
├── 생성 버튼               simple-gen-btn "⚡ 음악 생성하기"
├── 커스텀 모드 전환 버튼    "🎛 더 세밀하게 조정하기"
└── 모델 퀄리티 비교 버튼    "🎧 V3.5 vs V4.5"
```

### 1-3. YouTube 패널 (`#panel-youtube`)

YouTube URL 분석 → 유사 곡 생성.

```
panel-youtube
├── 곡 제목                  yt-song-title (선택)
├── YouTube URL              yt-url + 분석 버튼
├── 분석 결과                yt-result (동적)
├── 분위기 + 인스트루멘탈    yt-mood + yt-inst-toggle
└── 생성 버튼               yt-gen-btn (분석 후 활성화)
```

### 1-4. MV 패널 (`#panel-mv`)

텍스트→영상 뮤직비디오 생성.

```
panel-mv
├── MV 히어로                타이틀 + 설명
├── 영상 프롬프트            mv-prompt + AI 프롬프트 버튼
├── 화면 비율               9:16 세로 / 16:9 가로 / 1:1 정사각
├── 생성 모드               노멀 / 펀 / 스파이시
├── 고급 설정 (접이식)
│   └── 동영상 길이           5초 / 10초 / 직접 입력 (3~60초)
├── 기존 음악 연결           히스토리 트랙 선택 (선택사항)
├── 생성 버튼               mv-gen-btn "🎬 뮤직비디오 생성하기"
└── 결과 영역               mv-result-area (동적)
```

### 1-5. 로딩 카드 (`#loading-card`)

생성 중 표시. 웨이브폼 애니메이션 + 프로그레스 바 + 상태 텍스트.

### 1-6. 피드백 카드 (`#feedback-card`)

생성 완료 후 표시. 별점 + 피드백 태그 + 재작곡.

```
feedback-card
├── 별점 (1~5)
├── 피드백 태그              템포/에너지/보컬/장르 등 8개
├── 자유 텍스트 입력
└── 재작곡 / 건너뛰기 버튼
```

---

## 2. 내 라이브러리 (`#history-view`)

생성한 곡/뮤비 히스토리 관리.

```
history-view
├── hist-view-header         "내 라이브러리" + 곡 수 + 더보기 메뉴
├── 앨범/라이선스 버튼       💿 앨범 만들기 / 📜 상업 라이선스
├── hist-tabs                탭 필터
│   ├── 전체 (all)           ← 기본 활성
│   ├── 음악 (music)
│   ├── 뮤비 (mv)
│   ├── 좋아요 (liked)
│   ├── 플리 (playlist)
│   └── MY (myfeed)          커뮤니티 크리에이터 음악 모아보기
├── hist-toolbar
│   ├── 정렬                 최신순 / 오래된순
│   └── 뷰 전환             리스트 / 그리드 / 전체
└── history-view-grid        곡 목록 렌더 영역
```

### MY 피드 탭 (`myfeed`)

커뮤니티 크리에이터의 음악을 모아보는 서브 뷰.
`_renderMyFeedView()` 로 별도 렌더.

---

## 3. 커뮤니티 (`#community-view`)

커뮤니티 트랙/크리에이터 탐색. 상세 구조는 `docs/community-layout.md` 참조.

```
community-view
├── comm-header              "커뮤니티" 타이틀
├── comm-search-wrap         검색 입력 + 초기화
├── comm-filter-row          필터 탭
│   ├── 🔥 전체 (all)        ← 기본 활성
│   ├── 👤 크리에이터 (creators)
│   ├── 👥 팔로잉 (following)
│   ├── 🎵 K-Pop (kpop)
│   ├── 🎤 Hip-Hop (hiphop)
│   ├── ☕ Lo-Fi (lofi)
│   ├── ⚡ Electronic (electronic)
│   └── 🎬 OST (ost)
├── comm-sort-row            정렬 (인기순/최신순/별점순/재생순)
├── comm-trending-tags       트렌딩 태그
├── comm-dj-row              AI DJ (Chill/Energy/Mood/Mix)
├── comm-hero-wrap           Featured Hero 영역
├── comm-section-lbl         섹션 라벨
└── comm-list                트랙/크리에이터 리스트
```

**렌더링 분기:**
- 기본 모드 → `_renderCommContent()` : Hero → 인기차트 → 내곡 → 다른트랙
- 크리에이터 모드 → `_renderCreatorList()` : 크리에이터별 곡 그룹핑

---

## 4. 설정 (`#settings-view`)

사용자 프로필, 테마, 플랜, 앱 정보.

```
settings-view
├── settings-banner          사용자 배너
│   ├── 아바타 + 이름 + 로그인 버튼
│   └── 통계                 생성한 곡 / 총 재생 / 좋아요
├── 🎨 테마 설정
│   └── theme-grid           다크 / 데이
├── 🔔 푸시 알림
│   └── 앱 알림 구독 토글
├── 구독 플랜
│   ├── plan-current-banner  현재 플랜 + 사용량 바
│   ├── usage-stat-grid      생성한곡 / MV / 가사 / 예상비용
│   ├── plan-cards           Free / Pro / Creator 카드 (3단)
│   └── 크레딧 팩            10곡 / 30곡 / 100곡 일회성 구매
├── 기능
│   ├── 🎵 음악 만들기       → create-view 이동
│   ├── 📂 최근 생성         → history-view 이동
│   └── 🗑 히스토리 초기화    확인 모달 후 삭제
└── 앱 정보
    └── Kenny's Music Studio v2.0 · Powered by Suno AI
```

---

## 5. 크리에이터 프로필 (`#profile-view`)

커뮤니티 서브 뷰. `openCreatorProfile(name, provider)` 로 진입.

```
profile-view
├── profile-header
│   ├── profile-header-top
│   │   ├── pv-avatar        프로필 아바타
│   │   └── profile-info
│   │       ├── pv-name      사용자 이름
│   │       ├── pv-provider  프로바이더 (Google/카카오/네이버)
│   │       └── profile-stats 곡수 · 좋아요 · 팔로워
│   ├── pv-follow-btn        팔로우/팔로잉 버튼
│   └── profile-back-btn     "← 돌아가기" → community-view
├── pv-section-title         "🎵 곡 목록"
└── pv-tracks-list           트랙 리스트 (비동기 로드)
```

**데이터 로드:** `/api/profile?name=&provider=&viewerName=&viewerProvider=`
**반환:** `trackCount`, `totalLikes`, `followerCount`, `isFollowing`, `tracks[]`

---

## 오버레이 컴포넌트

탭 외부에 존재하는 전역 컴포넌트.

### 미니 플레이어 (`#mini-player`)

하단 탭바 위에 플로팅. 곡 재생 중 표시.

```
mini-player
├── mp-body
│   ├── mp-thumb             커버 이미지
│   ├── mp-info-area         제목 + 서브 + 시각화 바
│   └── mp-controls          재생/일시정지 + 다음곡 + 닫기
└── mp-prog-bar              프로그레스 바
```

### 트랙 상세 바텀시트 (`#mp-detail-sheet`)

미니 플레이어 클릭 시 확장.

```
mp-detail-sheet
├── mds-backdrop             배경 딤
└── mds-panel
    ├── mds-handle           드래그 핸들
    ├── mds-header           커버 + 제목 + 유저 + 스타일 칩
    └── mds-body
        ├── 🎨 스타일 설명    mds-style-desc
        ├── 🎤 가사           mds-lyrics-box + 복사 버튼
        ├── 액션 버튼         스타일 재사용 / 전체 재생
        └── 스타일 재사용 패널 가사 수정 textarea + 생성 버튼
```

---

## 탭 전환 (`switchTab`)

```javascript
function switchTab(viewId) {
  // 1. 모든 .view 숨김
  // 2. viewId에 해당하는 .view 표시 (.on 클래스)
  // 3. 하단 네비 활성 버튼 변경
  // 4. profile-view이면 community-view 버튼 활성 유지
  // 5. community-view이면 renderCommunity() 호출
}
```

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `index.html` | 전체 HTML + CSS + JS (단일 파일) |
| `docs/community-layout.md` | 커뮤니티 상세 레이아웃 규칙 |
| `api/profile.js` | 프로필/팔로우 API |
| `api/toss-config.js` | 플랜 정의 (Single Source of Truth) |
| `api/comments.js` | 댓글 API |
| `api/reports.js` | 신고 API |
