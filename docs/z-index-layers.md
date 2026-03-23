# z-index 계층 정리

> 최종 업데이트: 2026-03-23

index.html 내 모든 `position:fixed` 요소의 z-index 계층을 정리한 문서입니다.
수정 시 반드시 이 문서를 함께 업데이트하세요.

---

## 계층 다이어그램 (낮은 → 높은)

```
z-index         요소                              비고
─────────────────────────────────────────────────────────────
50              .search-suggest                   검색 자동완성
                .hist-more-menu                   히스토리 더보기 메뉴
100             헤더 (sticky)                     상단 고정 헤더
─────────────────────────────────────────────────────────────
10000           #gen-lock-popup 내부              생성 중 락 팝업
10001           #login-sheet                      로그인 시트
                #mv-track-picker                  MV 트랙 피커
                #recompose-sheet                  리컴포즈 시트
10002           #audio-switch-popup               오디오 전환 팝업
                #mp-detail-sheet                  미니플레이어 상세
10003           동적 오버레이 (JS 생성)            _showSettingsConfirm 등
10004           미니플레이어 래퍼                   mp-wrap (opacity 전환)
10005           미니플레이어                        position:fixed 하단
10006           #fullplayer                        풀플레이어 (전체화면)
                .comm-share-overlay               커뮤니티 공유 오버레이
                .report-overlay                   신고 오버레이
─────────────────────────────────────────────────────────────
                ⬆ 풀플레이어 위로 표시되어야 하는 시트들 ⬇
─────────────────────────────────────────────────────────────
10007           #hist-edit-sheet                   히스토리 편집 바텀시트
                #fp-edit-sheet                    풀플레이어 편집 바텀시트
10008           #hes-tools-sheet                   리믹스 & 도구 바텀시트
10009           #remix-cover-modal                 커버 변경 모달
                #remix-style-modal                 스타일 리믹스 모달
                #remaster-modal                   리마스터 모달
                #vocal-remove-modal               보컬 제거 모달
                #extend-modal                     곡 연장 모달
10500           #share-sheet                       공유 시트
                동적 공유 카드 오버레이             _generateShareCard
10600           #share-confirm-modal               공유 확인 모달
─────────────────────────────────────────────────────────────
                ⬆ 일반 UI 최상위 경계 ⬇
─────────────────────────────────────────────────────────────
20000           #ann-overlay                       공지사항 오버레이
                동적 프로필/크레딧 모달             앱 레벨 모달
99980           .ai-sheet-overlay                  AI 시트 오버레이
99990           .lyrics-gen-overlay                가사 생성 오버레이
                #mv-merge-overlay                 MV 합치기 오버레이
99997           동적 backdrop (가이드 등)           모달 뒷배경
99998           #profile-sheet                     프로필 시트
                동적 modal (가이드 등)              가이드 모달
99999           .comment-overlay                   댓글 오버레이
                #onboarding-overlay               온보딩 오버레이
                .feature-tip                      기능 팁
                동적 오버레이 다수                  toast, confirm 등
100000          .offline-banner                    오프라인 배너
                .skip-link                        접근성 스킵 링크
100001          #notif-sheet                       알림 시트
100002          #dm-sheet                          DM 시트
                동적 프로필 편집 오버레이
100003          #queue-sheet                       재생 대기열 시트
100004          #claude-chat-overlay               Claude AI 채팅 배경
100005          #claude-chat-panel                 Claude AI 채팅 패널
100010          fp-pl-overlay (동적)               플레이리스트 추가 바텀시트
                동적 공유 시트                      body 직접 렌더링
```

---

## 핵심 규칙

### 1. 풀플레이어 기준선 = 10006
풀플레이어에서 열리는 바텀시트는 반드시 **10007 이상**이어야 합니다.

| 범위 | 용도 |
|------|------|
| 10001~10005 | 풀플레이어 **아래** 요소 (미니플레이어, 로그인 등) |
| 10006 | 풀플레이어 자체 |
| 10007~10009 | 풀플레이어 **위** 바텀시트 (편집, 도구, 리믹스) |
| 10500~10600 | 공유 관련 시트/모달 |

### 2. 동적 생성 오버레이
JS로 `document.body.appendChild()`하는 오버레이는 **99999 이상** 사용.
풀플레이어 내에서 열리는 동적 시트는 **100010** 사용.

### 3. 시스템 레벨 (100000+)
오프라인 배너, 알림, DM, 재생 대기열 등 항상 최상위에 있어야 하는 요소.

---

## 수정 이력

| 날짜 | 변경 내용 |
|------|-----------|
| 2026-03-23 | 최초 작성. 풀플레이어 바텀시트 z-index 10001→10007~10009로 수정 |
| 2026-03-23 | Claude AI 채팅 패널 추가 (100004~100005) |
