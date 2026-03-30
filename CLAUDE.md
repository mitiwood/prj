# CLAUDE.md — 프로젝트 규칙 및 가이드

> 이 파일은 Claude Code가 코드 작성 시 반드시 따라야 하는 규칙입니다.

---

## 배포 (Deployment)

- Vercel 서버리스 환경에서 **async 호출에 반드시 `await` 사용**
  - 특히 텔레그램/카카오 봇 알림 (`fetch('/api/telegram')`, `fetch('/api/kakao-notify')`)
  - `await` 없으면 서버리스 함수가 먼저 종료되어 알림이 조용히 실패함
- 배포 전 환경변수/시크릿 존재 여부 확인:
  ```
  필수: KIE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
  선택: ANTHROPIC_API_KEY, GITHUB_TOKEN, KAKAO_JS_KEY, TOSS_CLIENT_KEY, VAPID 키
  ```
- Supabase 테이블 존재 여부 확인 후 코드 작성 (테이블 없으면 메모리 폴백 구현)

---

## 텔레그램 연동 (Telegram)

- **parse_mode는 절대 Markdown 사용 금지** → 항상 plain text 또는 HTML
  - Markdown에서 `()`, `_`, `*` 등이 파싱 에러 유발 → 400 Bad Request
  - `parse_mode: ''`는 falsy라 `|| 'Markdown'`으로 폴백되므로 사용 금지
- 한국어 텍스트 전송 시 `Buffer.from(JSON.stringify(payload), 'utf-8')` 인코딩 필수
- Windows bash에서 curl로 한글 전송 금지 → Python `urllib.request` 사용

---

## 카카오 연동 (Kakao)

- 카카오스토리 API 종료됨 → `story.kakao.com` 절대 사용 금지
- 카카오 공유: SDK 초기화 → `Kakao.Share.sendDefault()`, 미초기화 시 → 링크 복사 폴백
- 카카오 알림(나에게 보내기): `/api/kakao-notify` 경유, 300자 제한

---

## UI / 스타일링 (UI/Styling)

- UI 변경 시 **반드시 데이모드(라이트) + 다크모드 양쪽 확인**
  - 데이모드에서 다크 배경 적용은 반복 버그 — 주의
  - CSS 변수: `var(--bg)`, `var(--card)`, `var(--t1)` 등 테마 변수 사용
- `max-width: 480px` 모바일 퍼스트 레이아웃
- 바텀시트는 미니플레이어 위에 표시 (`z-index`, `bottom` 값 확인)

---

## 코드 품질 (Code Quality)

- JS 파일 수정 후 **`node --check <file>`로 문법 검사** 실행
- `const` 재선언 금지 — 기존 변수명 충돌 확인 (admin.html에서 반복 버그)
- 기존 기능 절대 제거 금지 (좋아요/싫어요/삭제 등)
- 11,000줄 `index.html` 수정 시 정확한 줄번호 확인 후 Edit

---

## Mixed Content / 인증 (Security)

- 외부 이미지/아바타 URL은 반드시 `_ensureHttps()`로 `http://` → `https://` 변환
  - 카카오 아바타(`http://k.kakaocdn.net/`)가 대표적 원인
  - OAuth 콜백, DB 저장, 클라이언트 렌더링 3곳 모두 적용 필수
- 일반 사용자 코드에서 **관리자 전용 API(401 반환) 호출 금지**
  - `/api/users` GET은 관리자 전용 → 일반 코드에서는 `?action=public-names` 사용

---

## API 사용 (API Usage)

- 외부 API 사용 전 **폐지 여부 확인** (카카오스토리, 특정 kie.ai 모델 등)
- kie.ai 지원 LLM: `gemini-2.5-flash`만 확인됨 (Claude/GPT 모델 비지원)
- kie.ai 가사 API: `callBackUrl` 필수 (없으면 422)
- kie.ai 음악 생성: `duration` 파라미터 무시됨 → extend API로 길이 조절

---

## 플랜 / 크레딧 (Plan/Credits)

- 플랜 정의는 `api/toss-config.js`가 **Single Source of Truth**
- 클라이언트 검증 + 서버 검증 2중 구조
- `checkPlanLimit()`은 `generate()`, `generateMV()`, YouTube 모드에서 반드시 호출

---

## 텔레봇 수정 후 배포 (Telegram Live Bot)

- 코드 수정 완료 후 **반드시 git commit + git push origin main** 실행
- push 완료 후 텔레그램 봇에 **수정 내용 요약 + 배포 링크** 함께 전송:
  ```
  ✅ 수정 완료!

  📝 수정 내용:
  - (변경사항 요약)

  📁 수정된 파일: (파일명)

  🚀 배포 시작됨 (Vercel 자동 배포)
  🔗 https://ai-music-studio-bice.vercel.app
  ```
- 항상 **한국어**로 응답

---

<!-- 마지막 테스트: 2026-03-23 -->
