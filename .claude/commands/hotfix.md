긴급 버그 수정 후 즉시 배포하는 스킬.

**Instructions:**
1. 사용자가 설명한 버그를 분석하고 관련 파일을 찾는다
2. 버그를 수정한다
3. 수정 내용을 검증한다 (문법 오류, 로직 확인)
4. `git add`로 수정된 파일만 스테이징 (.env, credentials 제외)
5. 커밋 메시지 자동 생성:
   - Format: `fix(scope): 설명`
   - 72자 이내
   - Footer: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
6. `git commit` 실행
7. `git push origin main` 실행
8. 결과 보고:
   - 🔧 버그 원인: `<원인 요약>`
   - 🩹 수정 내용: `<수정 요약>`
   - ✅ Committed: `<hash> <message>`
   - ✅ Pushed to origin/main
   - 🚀 Vercel auto-deploy triggered → https://ai-music-studio-bice.vercel.app
   - 변경된 파일 목록

**Rules:**
- 수정 전 반드시 관련 코드를 읽고 이해한다
- 최소한의 변경만 한다 (버그 수정에 집중)
- `--no-verify` 사용 금지
- Working directory: C:\Users\pc\Downloads\kenny\ai-music-studio
