# Kenny's Music Studio — 기능 명세서

> **버전:** 3.0
> **최종 수정:** 2026-03-25
> **총 코드:** index.html 23,065줄 / admin.html 8,758줄 / 커밋 826회 / API 46개
> **URL:** https://ddinggok.com

---

## 1. 서비스 개요

| 항목 | 내용 |
|------|------|
| **서비스명** | Kenny's Music Studio |
| **한줄 소개** | AI로 나만의 음악을 만들고, 커뮤니티에서 공유하는 플랫폼 |
| **타겟** | 음악 비전문가 (작곡 경험 없는 일반인) |
| **플랫폼** | 모바일 웹 PWA (max-width 480px) |
| **호스팅** | Vercel Serverless Functions |
| **DB** | Supabase (PostgreSQL) + Realtime |
| **AI 엔진** | kie.ai (Suno), Gemini 2.5 Flash, Claude Haiku |

---

## 2. 기술 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | Vanilla HTML/CSS/JS (SPA, 프레임워크 없음) |
| Backend | Node.js ESM, Vercel Serverless Functions (46개) |
| DB | Supabase PostgreSQL + RLS + Realtime |
| AI 음악 | kie.ai API (Suno v1) |
| AI 텍스트 | Gemini 2.5 Flash (via kie.ai), Claude Haiku 4.5 |
| 결제 | Toss Payments (카드) |
| 인증 | OAuth 2.0 (Google / Kakao / Naver) + 게스트 모드 |
| 푸시 | Web Push (VAPID, web-push) |
| 봇 | Telegram Bot (webhook) + KakaoTalk (나에게 보내기) |
| CI/CD | GitHub Actions + Vercel Auto Deploy |
| 테마 | 다크 모드 (기본) / 데이 모드 + 커스텀 색상 |
| 실시간 | Supabase Realtime (채팅 WebSocket) |

---

## 3. 사용자 화면 구조

### 3.1 하단 네비게이션 (4탭)

```
┌──────────┬──────────┬──────────┬──────────┐
│ 커뮤니티  │ 만들기 ♪  │  보관함   │   설정   │
└──────────┴──────────┴──────────┴──────────┘
```

### 3.2 만들기 (Create View)

#### 3.2.1 모드 탭 (4개)

| 모드 | 설명 |
|------|------|
| **커스텀** | 장르/무드/BPM/보컬/악기/가사/모델 전체 조절 |
| **심플** | 설명 한 줄 → AI가 자동 작곡 |
| **YouTube** | URL 분석 → AI 커버 생성 |
| **MV** | 텍스트 → 뮤직비디오 생성 (Kling 2.6) |

#### 3.2.2 커스텀 모드 파라미터

| 파라미터 | 타입 | 옵션 |
|----------|------|------|
| 장르 | 버튼 그리드 | K-Pop, Hip-Hop, Electronic, Rock, Lo-Fi, Jazz, Classical, Acoustic |
| 서브장르 | 드롭다운 | 장르별 동적 목록 |
| 무드 | 드롭다운 | energetic, chill, dark, emotional, romantic, epic, uplifting, warm |
| BPM | 슬라이더 | 60~200 (AUTO 옵션) |
| 곡 시간 | 버튼 | 자동 / ~1분 / ~2분 (AI 자동 결정, extend로 연장) |
| 모델 | 드롭다운 | V3.5(빠름) / V4 / V4.5(권장) / V4.5+(8분) |
| 보컬 | 토글+성별 | 인스트루멘탈 / 남성 / 여성 / 자동 |
| 악기 | 버튼 그리드 | Piano, Guitar, Synth, Violin, Bass, Drums, Saxophone, Choir |
| 가사 | 텍스트에어리어 | 직접 입력 / AI 자동 작사 (kie.ai + Claude 폴백) |
| 가사 도우미 | 버튼 | [Verse] [Chorus] [Bridge] [Outro] 섹션 태그 삽입 |
| 참조 아티스트 | 자동완성 입력 | 30명 datalist (BTS, IU, aespa, Billie Eilish 등) |
| 가사 언어 | 드롭다운 | 한국어/영어/일본어 등 |
| 스타일 강도 | 슬라이더 | 장르 충실 ↔ 장르 블렌딩 |
| 창의성 | 슬라이더 | 컨벤셔널 ↔ 실험적 |
| 네거티브 태그 | 텍스트 | 제외할 요소 |

#### 3.2.3 프리셋 시스템 (원클릭 작곡)

| 프리셋 | 장르 | BPM | 악기 | 보컬 |
|--------|------|-----|------|------|
| K-Pop 걸그룹 | K-Pop Dance | 128 | Synth, Bass | 여성 |
| 감성 발라드 | Ballad | 72 | Piano, Strings | 여성 |
| 힙합 트랩 | Trap | 140 | 808 Bass, Hi-Hat | 남성 |
| 로파이 칠 | Lo-Fi Hip Hop | 85 | Piano, Guitar | 인스트 |
| EDM 클럽 | Future Bass | 150 | Synth, Bass, Drums | 인스트 |
| R&B 소울 | R&B | 90 | Piano, Bass | 남성 |
| 인디 록 | Indie Rock | 120 | Guitar, Drums, Bass | 남성 |
| 재즈 라운지 | Jazz | 110 | Piano, Saxophone, Bass | 인스트 |
| 시네마틱 | Cinematic | 100 | Strings, Piano, Choir | 인스트 |
| 어쿠스틱 | Acoustic Pop | 100 | Guitar | 여성 |

#### 3.2.4 심플 모드

| 입력 | 설명 |
|------|------|
| 곡 제목 | 선택 (비우면 AI 자동) |
| 곡 설명 | 필수 — 원하는 음악 설명 |
| 무드 | 드롭다운 |
| 가사 | 선택 (비우면 AI 자동 작사) |
| BPM | 슬라이더 |
| AI 어시스턴트 | 대화형 추천 (gemini-2.5-flash) |
| 커스텀 전환 | "더 세밀하게 조정하기" 버튼 → 커스텀 모드 이관 |

#### 3.2.5 YouTube 모드

| 단계 | 동작 |
|------|------|
| 1. URL 입력 | YouTube 링크 붙여넣기 |
| 2. 분석 | /api/yt-analyze → Claude가 장르/BPM/무드 추출 |
| 3. 커스터마이즈 | 무드, 가사 수정 가능 |
| 4. 생성 | kie.ai로 커버 생성 |

#### 3.2.6 MV 모드

| 파라미터 | 옵션 |
|----------|------|
| 모델 | Kling 2.6 text-to-video |
| 비율 | 16:9 / 9:16 / 1:1 |
| 길이 | 5초 / 10초 |
| 프롬프트 | 영상 설명 텍스트 |

#### 3.2.7 생성 결과

| 기능 | 설명 |
|------|------|
| A/B 비교 | 2곡 동시 생성 → A/B 라벨로 비교 청취 |
| 재생 | 인라인 오디오 플레이어 |
| 가사 보기/편집 | 탭 전환 |
| 다운로드 | MP3 다운로드 |
| 연장 | 곡 이어붙이기 (extend API) |
| 보컬 변환 | 보컬 스타일 교체 (6종 프리셋) |
| 보컬 제거 | MR 추출 옵션 |
| 리컴포즈 | 파라미터 수정 후 재생성 |
| 리믹스 | 장르 변경 프리셋 (K-Pop/EDM/Lo-Fi/Acoustic/Hip-Hop/Orchestral) |
| 자동 재시도 | 생성 실패 시 1회 자동 재시도 (민감단어/크레딧 제외) |
| 강제 취소 | 생성 중 팝업에서 강제 취소 버튼 |
| 노래방 모드 | 가사 타임싱크 카라오케 |
| 공유 | A/B 선택뷰에서 바로 공유 모달 |

#### 3.2.8 보컬 라이브러리 (변환 프리셋 6종)

| 프리셋 | 설명 |
|--------|------|
| 걸그룹 | sweet female, K-Pop idol, bright |
| R&B 남성 | deep male, smooth, soulful |
| 발라드 여성 | powerful female, emotional, wide range |
| 록 남성 | raspy male, rock energy, raw |
| 인디 여성 | soft breathy, indie, whisper |
| 래퍼 | aggressive male rap, trap flow |

#### 3.2.9 AI 작곡 어시스턴트

| 항목 | 내용 |
|------|------|
| 입력 | 자연어 ("비 오는 날 듣기 좋은 재즈") |
| 엔진 | gemini-2.5-flash (kie.ai 경유) |
| 출력 | 추천 장르, 무드, BPM, 악기, 참조 아티스트, 설명 |
| 적용 | "심플 모드에 적용" 버튼 |

#### 3.2.10 심플→커스텀 자동 전환

| 조건 | 동작 |
|------|------|
| 프롬프트 400자 초과 | kie.ai non-custom 500자 제한 → 자동 customMode 전환 |

---

### 3.3 커뮤니티 (Community View)

#### 3.3.1 피처드 히어로

| 요소 | 설명 |
|------|------|
| 커버 이미지 | 좋아요 1위 곡 |
| 재생 버튼 | 인라인 오디오 플레이어 |
| 프로그레스 바 | 재생 진행률 |
| 좋아요/싫어요 | 카운트 표시 |
| 댓글 | 댓글 시트 열기 |
| 가사/정보 | 상세 패널 |

#### 3.3.2 리스트 아이템 (3열 구조)

```
┌─────────────────────────────────┐
│ [썸네일] 제목         2:34  NEW │ ← 1열: 제목 + 재생시간
│          🔵 kenny       ❤️ 12  │ ← 2열: 사용자 + 좋아요
│          K-Pop · Ballad        │ ← 3열: 음악 스타일
│ ▶/⏸ ❤️ 💔 ★★★☆☆ 💬 ↗        │ ← 액션 버튼
└─────────────────────────────────┘
```

#### 3.3.3 주간 TOP 10 차트

| 요소 | 설명 |
|------|------|
| 순위 | 1~10위 (재생+좋아요 가중) |
| 아티스트 사진 | 18px 원형 프로필 + provider 아이콘 |
| 재생 버튼 | 미니플레이어 동기화 (▶/⏸ 토글) |
| 하이라이트 | 재생 중인 아이템 보라색 강조 |

#### 3.3.4 크리에이터 섹션 (인라인)

| 요소 | 설명 |
|------|------|
| 위치 | 커뮤니티 하단 고정 |
| 데이터 | DB 전체 가입 사용자 (게스트/매니저 제외) |
| 레이아웃 | 가로 스와이프 (아바타 48px + 이름 + 곡수 + 팔로우) |
| 배지 | PRO 플랜 사용자 배지 |
| 캐시 | 5분 TTL |

#### 3.3.5 실시간 접속자

| 항목 | 내용 |
|------|------|
| 표시 | 커뮤니티 헤더에 "N명 접속 중" |
| 기준 | 최근 5분 이내 heartbeat (30초 간격) |
| API | /api/profile?action=heartbeat |

#### 3.3.6 커뮤니티 채팅

| 항목 | 내용 |
|------|------|
| 진입 | 커뮤니티 탭 채팅 모드 |
| 메시지 저장 | Supabase chat_messages 테이블 |
| 실시간 수신 | Supabase Realtime (WebSocket) + 1초 폴링 폴백 |
| 타이핑 표시 | chat_typing 테이블 (4초 TTL) |
| 고정 메시지 | 서버 인메모리 |
| 반복 방지 | 같은 내용 3초 내 재전송 차단 |
| 답글 | reply_to 기반 + 웹 푸시 알림 |
| 이모지 | 리액션 + 피커 |
| 삭제 | 본인 메시지만 |
| 날짜 구분선 | 오늘/어제/날짜 |
| 인사이트 | 접속자/오늘 메시지/참여자/MVP 표시 |
| 레이아웃 | 이름+내용+시간 가로 한 줄 버블 |

#### 3.3.7 재생 동기화

| 동작 | 결과 |
|------|------|
| 리스트 ▶ 클릭 | 미니플레이어 연동 재생, 버튼 ⏸ |
| 같은 곡 ⏸ 클릭 | 일시정지, 버튼 ▶ |
| 미니플레이어 ▶/⏸ | 리스트 버튼 동기화 |
| 곡 종료 | 모든 버튼 ▶ 초기화 |

#### 3.3.8 인터랙션

| 기능 | 설명 |
|------|------|
| 좋아요/싫어요 | 전체 UI 동기화 (미니/풀/커뮤니티/히스토리) |
| 별점 | 1~5점 |
| 댓글 | 작성/조회/삭제 (soft delete) |
| 공유 | 카카오/X/Facebook/링크복사 |
| 검색 | 제목/아티스트 검색 |
| 필터 | K-Pop, Hip-Hop, Lo-Fi, Electronic, OST |
| 내 곡 섹션 | 최신순 분리 표시 (MY 라벨) |

#### 3.3.9 데이터 정책

| 정책 | 내용 |
|------|------|
| 표시 대상 | 실제 가입 사용자의 트랙만 (더미 제거됨) |
| 리더보드 | 실제 가입 사용자만 |
| 크리에이터 | DB users 테이블 기반 |

---

### 3.4 보관함 (History View)

| 기능 | 설명 |
|------|------|
| 저장 | 최대 30곡 (localStorage + 서버 동기화) |
| 탭 필터 | 전체 / 음악 / MV |
| 편집 | 제목, 태그, 가사 수정 |
| 재생 | 미니플레이어 연동 |
| 다운로드 | MP3 직접 다운로드 |
| 삭제 | 개별 삭제 |
| 로컬→서버 동기화 | 로컬에만 있는 트랙 자동 서버 업로드 |
| 재시도 | 저장 실패 시 3초 후 1회 자동 재시도 |

---

### 3.5 설정 (Settings View)

| 기능 | 설명 |
|------|------|
| 프로필 | 소셜 로그인 정보 (이름, 아바타, 프로바이더) |
| 플랜 | Free / Pro / Creator 표시 + 업그레이드 |
| 사용량 | 이번 달 곡수/MV/가사 + 예상 비용 |
| 테마 | 다크 / 데이 모드 전환 |
| 커스텀 색상 | on/off 토글 + 색상 피커 패널 |
| 푸시 알림 | 구독 on/off |
| 출석 체크 | 배너 on/off 토글 (기본 OFF) |
| 플랜 동기화 | 탭 진입 시 서버와 즉시 동기화 |

---

### 3.6 플레이어

#### 미니 플레이어

```
┌─────────────────────────────────┐
│ [썸] 제목    ▶ ⏭ ✕             │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ ← 프로그레스바 (하단)
└─────────────────────────────────┘
```

#### 풀 플레이어

| 요소 | 설명 |
|------|------|
| 커버 아트 | 대형 이미지 |
| 프로그레스 바 | 드래그 가능 |
| 시간 표시 | 현재/전체 |
| 컨트롤 | 재생/일시정지, 이전/다음 |
| 이퀄라이저 | 시각화 애니메이션 |
| 가사 | 실시간 싱크 (카라오케) |
| 퀵 메뉴 | 좋아요/싫어요/플레이리스트/공유/다운로드/편집/삭제 |

#### 좋아요/싫어요 전체 동기화

| 위치 | 동기화 |
|------|--------|
| 미니플레이어 | ✅ |
| 풀플레이어 | ✅ (싫어요 포함) |
| 커뮤니티 리스트 | ✅ |
| 히스토리 | ✅ |

---

## 4. 플랜 & 결제

### 4.1 플랜 구조 (3단계)

| | Free | Pro (₩9,900/월) | Creator (₩19,900/월) |
|---|------|------|------|
| 곡 생성 | 5곡/월 | 50곡/월 | 무제한 |
| 모델 | V3.5만 | V3.5 ~ V4.5 | 전체 (V4.5+) |
| 최대 길이 | ~1분 | ~3분 | ~8분 |
| MV | 0 | 3개/월 | 20개/월 |
| 보컬 변환 | 0 | ✅ | ✅ |
| 다운로드 | MP3 | MP3/WAV | MP3/WAV/FLAC |
| 상업 라이선스 | 0 | 0 | ✅ |
| 우선 생성 | 0 | ✅ | 최우선 |

### 4.2 결제 플로우

```
사용자 "업그레이드" 클릭
  → 로그인 확인 (미로그인 시 소셜 로그인 유도)
  → Toss Payments 위젯 (카드)
  → /api/payments/success (서버 확인)
  → Supabase users.plan 업데이트
  → localStorage 동기화
  → 결제 완료 토스트
```

### 4.3 크레딧 검증 (2중)

| 계층 | 방식 |
|------|------|
| **클라이언트** | checkPlanLimit() → 즉시 차단 + 업그레이드 팝업 |
| **서버** | /api/check-credit → Supabase 실제 트랙 수 카운트 |

---

## 5. 인증

### 5.1 소셜 로그인

| 프로바이더 | 아이콘 |
|-----------|--------|
| Google | 🔵 |
| Kakao | 💬 |
| Naver | 🟢 |

### 5.2 게스트 모드

| 제한 | 내용 |
|------|------|
| 곡 생성 | 2곡까지 |
| 길이 | 1분 제한 |
| 모델 | V3.5 고정 |
| MV | 0 |
| 보컬 변환 | 0 |
| 곡 연장 | 0 |

---

## 6. 관리자 패널 (/admin)

### 6.1 섹션 (19개)

| 섹션 | 기능 |
|------|------|
| 📊 대시보드 | 실시간 통계, 차트, 헬스체크 |
| 🎵 음악 관리 | 트랙 검색/삭제/숨기기 + 상세 모달 (통계/비디오/메타) |
| 🌐 커뮤니티 | 공개/비공개 전환 |
| 💬 댓글 관리 | 노출/숨기기/삭제 |
| 👥 사용자 | 유저 목록/상세/차단 + 활동로그 + 팔로우이력 + 시스템로그 |
| 🛡️ 매니저 | 계정 CRUD + 역할 관리 |
| 🚩 신고 관리 | 처리/무시 |
| 📈 사용량·비용 | kie.ai API 비용 분석, CSV 내보내기 |
| 🤖 Claude 사용량 | API 키 상태, 호출 로그 |
| ⚡ 실시간 알림 | 접속 유저 전체 알림 발송 + 이력 |
| 🔔 푸시 알림 | 웹 푸시 발송 + 히스토리 |
| 📝 감사 로그 | 관리자 활동 기록 |
| 👔 매니저 관리 | 계정 생성/삭제/권한 |
| 🗄️ DB 관리 | Supabase 테이블 상태 |
| ⚙️ 설정 | 토글, 비밀번호 변경 |
| 📋 로그 보기 | 앱/Vercel 로그 |
| 🔗 kie.ai 로그 | API 호출 추적 |
| 📅 출석 관리 | 출석 현황 + 사용자 상세 팝업 |
| 🔄 자동 갱신 | 음악관리/사용자 섹션 30초 폴링 |

### 6.2 관리자 모바일 대응

| 항목 | 설명 |
|------|------|
| 모바일 FAB | 우하단 플로팅 메뉴 (☰/✕ 토글) |
| 반응형 | 통계카드/차트/테이블/모달 모바일 최적화 |
| 초소형 | ≤400px 별도 대응 |
| safe-area | iOS notch 지원 |
| PC | 사이드바 그대로 유지 |

### 6.3 매니저 역할 (3단계)

| 역할 | 접근 범위 |
|------|-----------|
| 🔧 슈퍼 매니저 | 설정 제외 전체 |
| 📋 매니저 | 대시보드/트랙/커뮤니티/신고 |
| 👁 뷰어 | 대시보드/사용량 (읽기만) |

---

## 7. 봇 시스템

### 7.1 텔레그램 봇 (@mitiwood_bot)

| 카테고리 | 명령어 |
|----------|--------|
| **모니터링** | 상태, 트랙, 유저, 댓글, 배포 |
| **관리** | 공지, 공지삭제, 삭제, 공개, 비공개, 댓글삭제 |
| **알림** | 알림 (전체 푸시) |
| **개발** | 수정, PR, 머지, QA, 진행상황 |
| **기획** | 기획, 백로그, 버그 |
| **디자인** | 디자인 |
| **사용량** | 사용량, 일간, 주간 |
| **채팅** | 채팅공지 (커뮤니티 채팅에 공지 전송), 채팅초기화 (전체 삭제) |

### 7.2 카카오톡 봇

| 기능 | 설명 |
|------|------|
| 나에게 보내기 | 이벤트 알림 (새 곡, 새 유저, 댓글, 에러 등) |
| 사용량 동시 전송 | 텔레그램과 동일 내용 |

### 7.3 자동화 파이프라인

```
텔레그램 "수정 버튼 색상 변경"
  → GitHub Issue 생성 (claude-fix 라벨)
  → Claude Code Action 자동 수정
  → PR 생성 → 텔레그램 알림
  → "머지 N" → squash merge
  → Vercel 자동 배포 (30초)
```

---

## 8. 실시간 알림 시스템

| 항목 | 내용 |
|------|------|
| 방식 | 10초 폴링 (/api/live-notify) |
| 대상 | 접속 중인 모든 사용자 (게스트 포함) |
| 표시 | 상단 토스트 팝업 (7초 자동 소멸) |
| 관리 | admin → 실시간 알림 탭 |
| 동시 전송 | 텔레그램 + 카카오 |
| 저장 | Supabase (폴백: 인메모리) |

---

## 9. 에러 모니터링

| 이벤트 | 동작 |
|--------|------|
| JS 오류 (window.onerror) | 텔레그램 + 카카오 즉시 알림 |
| 비동기 오류 (unhandledrejection) | 텔레그램 + 카카오 즉시 알림 |
| 쿨다운 | 5초 (도배 방지) |
| 무시 패턴 | 미디어/리사이즈/네트워크/AbortError |
| 내용 | 에러 메시지, 파일명, 줄번호, 스택 (최대 500자) |

---

## 10. API 엔드포인트 (46개)

### 10.1 음악/콘텐츠

| API | 메서드 | 인증 | 설명 |
|-----|--------|------|------|
| `/api/kie` | POST | x-kie-key | kie.ai 프록시 (음악 생성) |
| `/api/kie-proxy` | POST | 관리자 | kie.ai CORS 프록시 (키 보호+크레딧 검증) |
| `/api/tracks` | GET/POST/PATCH/DELETE | 부분 | 트랙 CRUD, 좋아요/싫어요/별점, 단건조회, creators 모드 |
| `/api/comments` | GET/POST/PATCH/DELETE | 부분 | 댓글 CRUD (soft delete) |
| `/api/share` | GET | 없음 | OG 메타 태그 랜딩 페이지 |
| `/api/analyze` | POST | 없음 | Claude로 YouTube → Suno 프롬프트 |
| `/api/yt-analyze` | POST | 없음 | YouTube URL 분석 (장르/BPM/무드) |
| `/api/check-credit` | POST | 없음 | 서버 크레딧 검증/차감 |
| `/api/og-image` | GET | 없음 | OG 이미지 동적 생성 |
| `/api/playlist` | GET/POST/DELETE | 부분 | 플레이리스트 CRUD |
| `/api/challenges` | GET/POST | 부분 | 챌린지 CRUD |
| `/api/collabs` | GET/POST | 부분 | 협업 모드 |
| `/api/my-feed` | GET | 부분 | 팔로잉 피드 |

### 10.2 사용자/인증

| API | 메서드 | 인증 | 설명 |
|-----|--------|------|------|
| `/api/users` | GET/POST/DELETE | 부분 | 유저 관리/로그인 기록 |
| `/api/managers` | GET/POST/PATCH/DELETE | 관리자 | 매니저 계정 CRUD |
| `/api/profile` | GET/POST | 부분 | 프로필/팔로우/heartbeat/creators/batch-follow-check |
| `/api/callback` | GET | 없음 | OAuth 콜백 |
| `/api/attendance` | GET/POST | 부분 | 출석 체크 |
| `/api/reports` | GET/POST | 부분 | 신고 관리 |

### 10.3 결제

| API | 메서드 | 인증 | 설명 |
|-----|--------|------|------|
| `/api/toss-config` | GET | 없음 | 플랜 정의 + Toss 클라이언트 키 |
| `/api/payments/success` | GET | 없음 | 결제 성공 콜백 |
| `/api/payments/webhook` | POST | Toss 서명 | 결제 이벤트 웹훅 |

### 10.4 채팅

| API | 메서드 | 인증 | 설명 |
|-----|--------|------|------|
| `/api/chat` | GET/POST | 부분 | 메시지 CRUD + 타이핑 + 고정 + 삭제 |
| `/api/realtime` | GET | 없음 | Supabase Realtime 연결 정보 |
| `/api/supabase-config` | GET | 없음 | anon key (Realtime 연결용) |

### 10.5 알림

| API | 메서드 | 인증 | 설명 |
|-----|--------|------|------|
| `/api/announcement` | GET/POST/DELETE | 부분 | 인앱 공지 팝업 |
| `/api/live-notify` | GET/POST/DELETE | 부분 | 실시간 알림 (폴링) |
| `/api/push-subscribe` | POST | 없음 | 푸시 구독 등록 |
| `/api/push-send` | POST | 관리자 | 웹 푸시 발송 |
| `/api/push-history` | GET/POST/DELETE | 관리자 | 푸시 히스토리 |
| `/api/vapid-keys` | GET | 없음 | VAPID 공개키 |

### 10.6 봇

| API | 메서드 | 인증 | 설명 |
|-----|--------|------|------|
| `/api/telegram` | GET/POST | 관리자 | 텔레그램 메시지 발송 |
| `/api/tg-webhook` | GET/POST | chatId | 텔레그램 웹훅 (28개 명령) |
| `/api/tg-report` | GET/POST | 관리자 | 단순 메시지 발송 |
| `/api/tg-debug` | GET | 관리자 | 환경변수 디버그 |
| `/api/kakao-notify` | GET/POST | 없음 | 카카오톡 나에게 보내기 |
| `/api/kakao-webhook` | POST | 없음 | 카카오 오픈빌더 스킬서버 |
| `/api/kakao-talk` | GET | 없음 | 카카오 OAuth 토큰 관리 |
| `/api/notify-manager` | POST | 관리자 | 매니저 이메일 알림 (Resend) |

### 10.7 AI 챗

| API | 메서드 | 인증 | 설명 |
|-----|--------|------|------|
| `/api/claude-chat` | POST | 없음 | Claude AI 대화 (한국어 응답) |

### 10.8 시스템

| API | 메서드 | 인증 | 설명 |
|-----|--------|------|------|
| `/api/config` | GET | 없음 | KIE API 키 전달 |
| `/api/setup-db` | GET/POST | 관리자 | DB 테이블 확인/생성 |
| `/api/logs` | GET | 관리자 | Vercel 배포 로그 |
| `/api/claude-usage` | GET | 관리자 | Claude API 상태 |
| `/api/error-logs` | GET/POST | 부분 | 에러 로그 기록/조회 |
| `/api/sentry-proxy` | POST | 없음 | Sentry API 프록시 |
| `/api/sw.js` | GET | 없음 | Service Worker |

### 10.9 Cron

| API | 스케줄 | 설명 |
|-----|--------|------|
| `/api/cron/status` | 30분마다 | 상태 체크 |
| `/api/cron/healthcheck` | 매일 00:00 UTC | 전체 서비스 헬스체크 + 텔레그램 리포트 |

---

## 11. DB 스키마

### 11.1 테이블 (10개+)

| 테이블 | 주요 컬럼 |
|--------|-----------|
| **tracks** | id, title, audio_url, video_url, image_url, tags, lyrics, gen_mode, owner_name, owner_provider, owner_avatar, comm_likes/dislikes/plays/rating, is_public |
| **users** | name, provider, email, avatar, plan, credits, plan_expires, login_count, last_login, location |
| **comments** | track_id, parent_id, author_name, content, is_hidden |
| **payments** | order_id, payment_key, amount, plan, status, method |
| **announcements** | title, body, icon, type, target, active, expires_at |
| **settings** | key (PK), value (JSONB) |
| **live_notifications** | id, title, body, icon, type, target, ts |
| **chat_messages** | id, room, user_name, user_provider, user_avatar, content, reply_to, created_at |
| **chat_typing** | user_name (PK), updated_at |
| **follows** | follower_name, follower_provider, following_name, following_provider |
| **notifications** | id, type, message, user_name, created_at (시스템 로그) |
| **managers** | id, username, password_hash, role, created_at |

### 11.2 RLS 정책

| 정책 | 규칙 |
|------|------|
| 공개 읽기 | tracks, users, announcements, live_notifications, chat_messages |
| 서비스 롤 쓰기 | 모든 테이블 |
| chat_messages | SELECT/INSERT/DELETE 모두 허용 (Realtime용) |

### 11.3 Realtime

| 테이블 | 설정 |
|--------|------|
| chat_messages | publication 활성화, REPLICA IDENTITY FULL |

---

## 12. GitHub Actions

| 워크플로우 | 트리거 | 동작 |
|-----------|--------|------|
| `claude-fix.yml` | Issue (claude-fix 라벨) | Claude Code가 코드 수정 → PR 자동 생성 |
| `notify-pr.yml` | PR 생성 | 텔레그램에 머지 안내 전송 |

---

## 13. Vercel Cron

| 경로 | 스케줄 | 동작 |
|------|--------|------|
| `/api/cron/status` | 30분마다 | 상태 체크 |
| `/api/cron/healthcheck` | 매일 00:00 UTC | 전체 서비스 헬스체크 + 텔레그램 리포트 |

---

## 14. 환경 변수

| 변수 | 용도 | 필수 |
|------|------|------|
| `KIE_API_KEY` | kie.ai 음악 생성 | ✅ |
| `SUPABASE_URL` | DB URL | ✅ |
| `SUPABASE_SERVICE_KEY` | DB 서비스 키 | ✅ |
| `SUPABASE_ANON_KEY` | Realtime 연결 (anon) | ✅ |
| `ANTHROPIC_API_KEY` | Claude API | ✅ |
| `TELEGRAM_BOT_TOKEN` | 텔레그램 봇 | ✅ |
| `TELEGRAM_CHAT_ID` | 관리자 채팅 ID | ✅ |
| `ADMIN_SECRET` | 관리자 인증 키 | ✅ (기본값 있음) |
| `TOSS_CLIENT_KEY` | 결제 클라이언트 | ⭕ |
| `TOSS_SECRET_KEY` | 결제 서버 | ⭕ |
| `GITHUB_TOKEN` | Issue/PR/머지 | ⭕ |
| `VAPID_PUBLIC_KEY` | 웹 푸시 | ⭕ |
| `VAPID_PRIVATE_KEY` | 웹 푸시 서명 | ⭕ |
| `KAKAO_CLIENT_ID` | 카카오 OAuth | ⭕ |
| `VERCEL_TOKEN` | 배포 로그 조회 | ⭕ |
| `RESEND_KEY` | 이메일 발송 | ⭕ |

---

## 15. 파일 구조

```
ai-music-studio/
├── index.html              # 메인 SPA (23,065줄)
├── admin/
│   ├── admin.html          # 관리자 패널 (8,758줄)
│   └── login.html          # 매니저 로그인
├── api/                    # Vercel Serverless (46개)
│   ├── tracks.js           # 트랙 CRUD + 동기화
│   ├── users.js            # 유저 관리
│   ├── comments.js         # 댓글
│   ├── chat.js             # 커뮤니티 채팅
│   ├── profile.js          # 프로필/팔로우/heartbeat/creators
│   ├── check-credit.js     # 서버 크레딧 검증
│   ├── live-notify.js      # 실시간 알림
│   ├── tg-webhook.js       # 텔레그램 봇 (28명령)
│   ├── kakao-notify.js     # 카카오 알림
│   ├── toss-config.js      # 플랜 정의 (Single Source of Truth)
│   ├── attendance.js       # 출석 체크
│   ├── claude-chat.js      # Claude AI 챗
│   ├── supabase-config.js  # Realtime 설정
│   ├── realtime.js         # Supabase Realtime
│   └── ...                 # 32개 추가
├── .github/workflows/
│   ├── claude-fix.yml      # AI 자동 수정
│   └── notify-pr.yml       # PR 알림
├── sw.js                   # Service Worker (PWA)
├── vercel.json             # 라우팅 + 크론
└── SPEC.md                 # 이 파일
```
