# 주요 정책 & 세부 정책

---

## 1. 주요 정책

### 1.1 서비스 정책

| 정책 | 내용 |
|------|------|
| **무료 제공 범위** | 월 5곡, V3.5 모델, 1분 제한, MP3 다운로드 |
| **유료 전환 기준** | 5곡 초과, V4.5 모델, MV, 보컬 변환 시 Pro 필요 |
| **게스트 제한** | 2곡까지, 1분, V3.5 고정, MV/보컬/연장 불가 |
| **데이터 보존** | 생성 미디어 14일 (kie.ai), 서버 트랙 영구, 로컬 30곡 |
| **콘텐츠 정책** | 부적절한 가사 자동 필터링 (SENSITIVE_WORD_ERROR) |

### 1.2 보안 정책

| 정책 | 내용 |
|------|------|
| **인증** | OAuth 2.0 (Google/Kakao/Naver) + ADMIN_SECRET Bearer |
| **RLS** | Supabase Row Level Security — anon 읽기, service_role 쓰기 |
| **API 키 보호** | 환경변수로만 관리, 프론트엔드 노출 최소화 (/api/config 경유) |
| **XSS 방지** | `esc()` 함수로 HTML 이스케이프 |
| **관리자 접근** | ADMIN_SECRET + 매니저 역할 기반 접근 제어 (3단계) |
| **봇 보안** | TELEGRAM_CHAT_ID로 허용된 채팅방만 명령 실행 |
| **Realtime 보안** | SUPABASE_ANON_KEY로 WebSocket 연결, RLS 정책 적용 |

### 1.3 과금 정책

| 플랜 | 가격 | 곡 | MV | 모델 | 길이 |
|------|------|----|----|------|------|
| Free | ₩0 | 5/월 | 0 | V3.5 | ~1분 |
| Pro | ₩9,900/월 | 50/월 | 3/월 | ~V4.5 | ~3분 |
| Creator | ₩19,900/월 | 무제한 | 20/월 | 전체 | ~8분 |

### 1.4 운영 정책

| 정책 | 내용 |
|------|------|
| **배포** | main push → Vercel 자동 배포 (30초) |
| **헬스체크** | push 후 자동 4개 엔드포인트 검증 |
| **에러 알림** | JS 오류 → 텔레그램+카카오 5초 쿨다운 |
| **크론** | 30분 상태체크, 일일 전체 헬스체크 |
| **로그 보존** | kie.ai 2개월, Vercel 배포 기록 영구 |

---

## 2. 세부 정책

### 2.1 음악 생성 정책

```
생성 요청 → 플랜 체크 → API 호출 → 폴링 → 결과 표시 → 서버 저장 → 알림

체크 순서:
1. 로그인 확인 (미로그인 → 로그인 시트)
2. 게스트 2곡 제한 (초과 → 소셜 로그인 유도)
3. checkPlanLimit() (한도 초과 → 업그레이드 팝업)
4. _serverCreditCheck() (서버 비동기 검증)
5. 생성 성공 → trackUsage() + _serverCreditDeduct()
6. 실패 → 1회 자동 재시도 (민감단어/크레딧/422 제외)
7. 생성 중 강제 취소 버튼 제공

심플→커스텀 자동 전환:
- 프롬프트 400자 초과 시 → customMode: true (kie.ai 500자 제한 대응)
```

### 2.2 커뮤니티 정책

```
공개 트랙:
- is_public=true인 트랙만 커뮤니티에 노출
- 좋아요순 정렬, 최상위 1곡은 히어로 카드
- 내 곡 섹션 분리 (최신순 → 좋아요순)
- 실제 가입 사용자의 트랙만 표시 (더미/테스트 데이터 제거됨)

댓글:
- 작성: 로그인 필수 (게스트 불가)
- 삭제: 작성자 본인 또는 관리자만
- soft delete (is_hidden=true)
- 댓글 수 배치 조회 + 60초 TTL 캐시

좋아요/싫어요:
- Supabase 실시간 반영
- 전체 UI 동기화 (미니/풀플레이어/커뮤니티/히스토리)
- 별점: 1~5점 (comm_rating)
- 재생수: 5초 이상 재생 시 카운트

주간 TOP 10:
- 재생+좋아요 가중 점수
- 아티스트 프로필 사진 + provider 아이콘
- 재생 버튼 미니플레이어 동기화

크리에이터:
- 커뮤니티 하단 인라인 고정
- DB users 테이블 기반 (게스트/매니저 제외)
- 가로 스와이프, PRO 배지, 5분 캐시

실시간 접속자:
- 30초 heartbeat → users.last_login 갱신
- 5분 이내 활동 = 온라인
- 커뮤니티 헤더에 표시
```

### 2.3 채팅 정책

```
아키텍처:
- 메시지 저장: Supabase chat_messages 테이블
- 실시간 수신: Supabase Realtime (WebSocket) + 1초 폴링 폴백
- 타이핑: chat_typing 테이블 (4초 TTL, 3초마다 재전송)
- 고정 메시지: 서버 인메모리 (재시작 시 초기화)

메시지 규칙:
- 반복 방지: 같은 내용 3초 내 재전송 차단
- 삭제: 본인 메시지만
- 답글: reply_to 기반 + 상대방에게 웹 푸시 알림

채팅 모드 진입 시:
- 채팅 UI + 크리에이터만 표시
- DJ/차트/스포트라이트/장르/챌린지/추천/활동피드 DOM 완전 제거
- 트랙 API 호출 + 무한 스크롤 완전 차단

채팅 모드 이탈 시:
- 채팅 UI DOM 제거
- 이전 모드 UI 복원

Realtime 연결:
- @supabase/supabase-js CDN 동적 로드
- anon key 줄바꿈 trim 필수 (서버+클라이언트)
- 연결 성공 시 폴링 스킵
- 연결 실패 시 1초 폴링 폴백

관리자 명령:
- 채팅공지 → 📢 prefix 시스템 메시지
- 채팅초기화 → chat_messages 전체 삭제
```

### 2.4 결제 정책

```
결제 플로우:
1. 로그인 필수 (게스트 → 소셜 로그인 유도)
2. Toss 위젯으로 카드 결제
3. 서버에서 Toss API 확인
4. Supabase users.plan 업데이트
5. localStorage 동기화
6. 사용량 초기화

환불/취소:
- Toss 웹훅 CANCELED/EXPIRED → plan='free' 다운그레이드
- 만료: plan_expires 체크 → 자동 다운그레이드

방어:
- 클라이언트 검증 (checkPlanLimit)
- 서버 검증 (/api/check-credit)
- Supabase 실제 트랙 수 카운트

플랜 동기화:
- 설정 탭 진입 시 서버와 즉시 동기화
- 관리자 플랜 변경 시 클라이언트 즉시 반영
```

### 2.5 봇 정책

```
텔레그램:
- 28개 명령어, 자연어 매핑 지원
- CHAT_ID 인증 (허용된 채팅방만)
- plain text 전송 (Markdown 금지)
- 한글 UTF-8 Buffer 인코딩
- 채팅공지/채팅초기화 명령어 추가

카카오:
- 오픈빌더 스킬서버 (/api/kakao-webhook)
- TextCard UI + QuickReplies
- 나에게 보내기 (/api/kakao-notify)
- 300자 제한 대응

동시 전송:
- 음악 생성, 유저 로그인, 에러 → TG+카카오 병렬
- 사용량 명령 → TG+카카오 동일 내용
```

### 2.6 에러 처리 정책

```
프론트엔드:
- window.onerror → TG+카카오 알림 (5초 쿨다운)
- 무시 패턴: ResizeObserver, AbortError, NotAllowedError, net::ERR
- HTML 이스케이프 후 parse_mode:'HTML'

서버:
- Supabase 장애 → 인메모리 폴백 (_mem 배열)
- 8초 타임아웃 (AbortController)
- try/catch + console.warn 로깅

kie.ai:
- SENSITIVE_WORD → "가사 수정" 안내
- 402/403 → "크레딧 부족" 안내
- 422/exceed → 자동 재시도 대상 제외
- 생성 실패 → 1회 자동 재시도

트랙 저장:
- _saveTrackToServer 실패 시 3초 후 1회 재시도
- 동기화 성공/실패 → notifications 테이블 로그 기록
```

### 2.7 테마 정책

```
다크 모드 (기본):
- --bg: #0a0a0f, --card: #16161f
- --acc: #7c3aed (보라색)
- 스크롤바: 보라색

데이 모드:
- [data-theme="light"] CSS 변수 오버라이드
- 밝은 배경, 어두운 텍스트
- 액센트: 동일 보라색 유지
- 풀플레이어: 라이트 스타일

커스텀 색상:
- on/off 토글 스위치
- 색상 피커 패널
- 초기화/저장 버튼

변경 시 반드시 양쪽 확인!
```

### 2.8 성능 정책

```
외부 이미지 차단:
- 차단 도메인: pexels.com, unsplash.com, placeholder.com, placekitten.com, picsum.photos
- _mfIsBlocked(url)로 사전 검사 → 차단 시 이미지 요청 안 함
- 아바타: 이니셜 아이콘 폴백 (_mfAvatar)
- 썸네일: 🎵 아이콘 폴백 (_mfThumb)

API 쿼리 최적화:
- profile.js: 프로필 조회 5쿼리 → Promise.all 병렬
- profile.js: followers/following N+1 → Promise.all(list.map) 병렬
- 팔로우 상태: batch-follow-check API (1회 쿼리로 전체 확인)
- tracks.js: mode=creators 경량 모드 (7개 컬럼만 SELECT)

클라이언트 캐싱:
- 크리에이터 목록: 메모리 캐시 (5분 TTL)
- 팔로우: _followStateCache + sessionStorage 백업 (5분 TTL)
- 커뮤니티 로드 완료 시 크리에이터 프리로드

커뮤니티 데이터 로딩:
- 메모리 캐시 TTL: 5분
- 폴링 간격: 60초
- Page Visibility API: 탭 비활성 시 폴링 중단
- 메모리에 데이터 있으면 0ms 즉시 렌더 + 백그라운드 갱신
- fingerprint 변경 감지 → 변경 없으면 리렌더 스킵
- _sbLoading 동시 호출 시 Promise 대기 (빈 화면 방지)

DOM 렌더링:
- 청크 렌더링 (20개 단위) + IntersectionObserver 자동 로드
- 이미지 loading="lazy" (5번째 이후)
- onerror에서 this.onerror=null 필수 (무한 루프 방지)
- 좋아요/싫어요: _commQuickRender()로 부분 DOM 갱신
- 순차 페이드인: translateY(20px)+scale(.97) → 스프링 애니메이션 (30~40ms stagger)

로딩 인디케이터:
- _commLoadingHtml(msg, small) 헬퍼 함수
- 보라색 바운스 도트 3개 + 텍스트
- 커뮤니티/팔로잉/채팅/크리에이터/MY피드/댓글 전체 통일
```

### 2.9 관리자 역할 정책

```
admin (최고 관리자):
- 모든 섹션 접근
- 매니저 생성/삭제
- 설정 변경
- 비밀번호 변경

super (슈퍼 매니저):
- 설정 제외 전체 접근
- 대시보드, 트랙, 커뮤니티, 유저, 신고, 사용량, 푸시, 감사로그

manager (매니저):
- 대시보드, 트랙, 커뮤니티, 신고만

viewer (뷰어):
- 대시보드, 사용량 (읽기만)
```

### 2.10 사용자 추적 정책

```
접속 위치:
- IP 기반 지오로케이션
- 관리자 패널에서 확인 가능

활동 로그:
- 로그인/로그아웃/신규가입 기록
- 관리자 사용자 상세에서 확인

온라인 상태:
- 30초 heartbeat → last_login 갱신
- 로그아웃 시 sendBeacon으로 상태 해제
- 이름 옆 온라인 표시

시스템 로그:
- 트랙 동기화/실패 이력
- notifications 테이블에 기록
```
