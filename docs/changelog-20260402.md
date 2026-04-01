# 수정 이력 — 2026-04-02

## 버그 수정

| # | 내용 | 커밋 |
|---|------|------|
| 1 | taskId is not defined (generate/YouTube 모드) — lastTaskId로 변경 | 여러 커밋 |
| 2 | formatTimeAgo is not defined — 전역 stub 추가 | 85960c8 |
| 3 | errMsg is not defined — e.message로 수정 | 6073c58 |
| 4 | SyntaxError 삼항연산자 — 메인 script 블록 크래시 | 02e391a |
| 5 | currentMode is not defined — window export + 동기화 | 2b308ec |
| 6 | SSE 폴링 비활성화 — Vercel 서버리스 불안정 | f68d8f5 |
| 7 | iOS Safari 심플/커스텀 모드 생성 안 됨 — _QueueManager 호이스팅, busy 잠금 | 여러 커밋 |
| 8 | generate() 이중 호출 — busy 체크 최상단 이동 + 5초 제한 제거 | 여러 커밋 |
| 9 | YouTube 모드 style 200자 초과 — 200자 슬라이스 전역 적용 | de87b53 |
| 10 | lyrics prompt 200자 초과 — 모든 호출에 slice 적용 | c79959f |
| 11 | OpaqueResponseBlocking — HEAD 요청 mode:cors 제거 | 916b931 |
| 12 | 오디오 만료 시 record-info로 URL 자동 갱신 | 5b86622 |
| 13 | 재생불가 URL localStorage 영속화 | 4494a28 |
| 14 | 알 수 없는 오류 — _classifyError 규칙 추가 + taskId 수정 | 404a270 |
| 15 | 커스텀 모드 2곡 생성 — pollResult 기본값 1 + _localGenCount 전달 | 404a270 |
| 16 | UserSync 생성 중 차단 | d428b4f |
| 17 | 프로필 변경 시 DB + 클라이언트 즉시 갱신 | d33de13 |
| 18 | 사용자 provider 전환 시 기존 레코드 업데이트 | 567a281 |
| 19 | 전체 API ilike → eq 교체 (12개 파일, 보안) | 여러 커밋 |
| 20 | 가사 [verse][chorus] 섹션 태그 제거 — 3중 필터 | d22bf78 |
| 21 | 다음곡 재생 시 제목/가사/커버 즉시 갱신 | 69c1282 |
| 22 | 가사 불일치 — API alignedWords 우선 + h.lyrics 업데이트 | 311a50b |
| 23 | 가사 없는 곡 → record-info에서 가사 복원 | 30b494f |

## 기능 추가

| # | 내용 |
|---|------|
| 1 | 슈퍼바이저 플랜 — toss-config, check-credit, kie-proxy, profile, 클라이언트 |
| 2 | SUPERVISOR_NAMES 환경변수 기반 슈퍼바이저 인식 |
| 3 | QR 코드 공유 기능 — 공유 모달 + 결과 카드 + MZ 리디자인 |
| 4 | 햅틱 피드백 5종 — 생성완료/버튼/탭전환/에러/삭제 |
| 5 | 관리자 음악관리 공유 기능 — 링크복사 + 카카오 + 커뮤니티 공개 |
| 6 | 관리자 플랜 변경 확인 팝업 UI |
| 7 | 관리자 사용자 목록 10초 실시간 폴링 |
| 8 | 도구 버튼 커버 위 오버레이 + 플로팅 도구 패널 |
| 9 | 재생 중 다른 곡 재생 시 확인 팝업 |
| 10 | 스킬 설명서 docs/SKILLS.md |

## 풀플레이어 리디자인

| # | 내용 |
|---|------|
| 1 | Apple Music 스타일 가사 — 활성 줄 22px 밝게 + 나머지 16px 어둡게 |
| 2 | 가사 포커스 인터랙션 — scale(0.95→1) + cubic-bezier |
| 3 | fp-cover 풀스크린 반투명 배경 (헤더까지) |
| 4 | fp-bottom 하단 고정 — 시크바+컨트롤+EQ 분리 |
| 5 | fp-side-actions fp-layout 안 세로 배치 |
| 6 | fp-spectrum 스펙트럼 바 복원 |
| 7 | fp-info + 가사 왼쪽 정렬 |
| 8 | 가사 클릭 시 해당 줄 시작부터 재생 |
| 9 | rAF 60fps 싱크 루프 |
| 10 | 가사 싱크 선로딩 (재생 전 타임스탬프 await) |
| 11 | 스플래시 데이모드 적용 |

## 해상도 대응

| # | 내용 |
|---|------|
| 1 | 결과 카드 세로 레이아웃 (커버 상단) |
| 2 | 아이패드 미니 반응형 보정 |
| 3 | 팝업/바텀시트/모달 25곳 min() 반응형 |
| 4 | 안드로이드 파란박스 제거 (-webkit-tap-highlight-color) |
| 5 | 음악 생성 모드 탭 숨김 시 부드러운 전환 |

## 미해결 / 향후

- 간주 구간 싱크: API alignedWords에 간주 마커 없음 → TS-API 응답 디버그 로그 추가됨
- waveform 데이터 활용 가능성 조사 필요
- index.html 모듈 분리 계획 수립 완료 (docs/WORK_PLAN.md #19)
