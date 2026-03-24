GitHub Issue를 생성하여 Claude Code 자동 수정을 요청하는 스킬.

**사용법:**
- `/fix 텔레봇에 /ping 명령어 추가해줘`
- `/fix 미니플레이어 재생버튼 안 눌리는 버그 수정`
- `/fix api/telegram.js에서 parse_mode HTML 기본값으로 변경`

**Instructions:**
1. 사용자의 수정 요청을 분석한다
2. GitHub Issue를 생성한다 (claude-fix 라벨 포함):
   ```bash
   curl -s -X POST \
     -H "Authorization: Bearer <GIT_TOKEN>" \
     -H "Accept: application/vnd.github+json" \
     -H "Content-Type: application/json; charset=utf-8" \
     "https://api.github.com/repos/mitiwood/ai-music-studio/issues" \
     --data-binary @- << 'ENDJSON'
   {
     "title": "<간결한 제목>",
     "body": "<상세 수정 지시사항>",
     "labels": ["claude-fix"]
   }
   ENDJSON
   ```
   - GIT_TOKEN은 git credential fill로 추출:
   ```bash
   echo "protocol=https\nhost=github.com" | git credential fill
   ```
3. 이슈 생성 결과를 사용자에게 보고:
   - 📋 Issue #N: <제목>
   - 🔗 <이슈 URL>
   - ⏳ Claude Code Auto-Fix Action 실행 중...
   - 📱 텔레그램/카카오 알림 발송됨
4. Action 실행 상태를 확인하고 결과 보고:
   - ✅ 성공 시: 머지 완료 + 이슈 종료 + 배포 시작
   - ❌ 실패 시: Action 로그 URL 안내

**파이프라인:**
Issue 생성 → Claude Code 수정 → main 머지 → Vercel 배포 → 이슈 종료 → 텔레그램+카카오 알림

**Rules:**
- 제목은 명확하고 간결하게 (50자 이내)
- 본문에 수정할 파일, 함수, 구체적 내용을 포함
- 기존 기능 제거 금지 규칙을 본문에 명시
- Working directory: C:\Users\pc\Downloads\kenny\ai-music-studio
