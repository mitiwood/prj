CLI에서 텔레봇/카카오봇 명령을 직접 실행하는 스킬.

**Instructions:**
1. 사용자가 입력한 명령을 텔레봇 또는 카카오봇 웹훅으로 전송한다
2. 기본은 양쪽 동시 실행, `tg` 또는 `kakao` 접두어로 특정 봇만 지정 가능
3. 실행 방법 (Python urllib, curl 금지):

```python
# 카카오 웹훅
payload = {"userRequest": {"utterance": "<명령>", "user": {"id": "cli"}}}
fetch('https://ai-music-studio-bice.vercel.app/api/kakao-webhook', POST, payload)

# 텔레그램은 결과를 직접 /api/telegram으로 전송
```

4. 응답을 파싱하여 사용자에게 보여준다
5. 텔레그램 전송 시 Python + parse_mode='' 사용

**지원 명령어:**
- 상태 — 서버 상태 리포트
- 트랙 — 최근 트랙 10곡
- 유저 — 유저 통계
- 댓글 — 최근 댓글 10개
- 배포 — 사이트 헬스체크
- 공지 <내용> — 공지 등록
- 공지삭제 — 공지 삭제
- 삭제 <트랙ID> — 트랙 삭제
- 공개/비공개 <트랙ID> — 공개 전환
- 댓글삭제 <댓글ID> — 댓글 삭제
- 알림 <메시지> — 전체 푸시 발송
- 수정 <지시사항> — Claude AI 코드 수정 → PR 생성
- PR — 열린 PR 목록
- 머지 <PR번호> — PR 머지
- QA — 전체 코드 점검 + 리포트
- 진행상황 — 현재 진행 중인 작업 추적
- 도움 — 명령어 목록

**예시:**
- `/bot 상태` → 양쪽 봇에 상태 명령 실행
- `/bot 진행상황` → 진행 중인 작업 조회
- `/bot 수정 미니플레이어 버그 수정해` → Issue 생성 → Claude 자동 수정

**Rules:**
- curl 사용 금지 — Python urllib만 사용
- 응답은 카카오 웹훅 JSON에서 simpleText.text를 추출하여 표시
- 텔레그램 전송 시 parse_mode='' (plain text)
- Working directory: C:\Users\pc\Downloads\kenny\ai-music-studio
