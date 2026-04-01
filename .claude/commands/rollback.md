이전 커밋으로 즉시 롤백 배포하는 스킬.

**Instructions:**
1. 최근 커밋 히스토리 표시:
   - `git log --oneline -10`으로 최근 10개 커밋 나열
   - 각 커밋 해시, 메시지, 날짜 표시

2. `$ARGUMENTS`가 있으면:
   - 커밋 해시 또는 숫자(N번째 이전)로 해석
   - 예: `/rollback 2` → 2개 전 커밋으로 롤백
   - 예: `/rollback abc1234` → 해당 커밋으로 롤백

3. 롤백 방식 (안전한 revert 사용):
   - `git revert --no-commit HEAD~N..HEAD` (N개 커밋 되돌리기)
   - 되돌릴 변경사항을 사용자에게 보여주기
   - 확인 후 커밋

4. 커밋 및 푸시:
   - 메시지: `revert: rollback to <hash> — <원래 메시지>`
   - `git push origin main`

5. 결과 보고:
   - ⏪ Rolled back: `<되돌린 커밋 목록>`
   - ✅ Committed: `<hash> <message>`
   - ✅ Pushed to origin/main
   - 🚀 Vercel auto-deploy triggered → https://ddinggok.com

**Rules:**
- `git reset --hard` 절대 사용 금지 (히스토리 보존)
- revert 충돌 시 사용자에게 알리고 수동 해결 안내
- 롤백 전 반드시 되돌릴 내용 확인 요청
- Working directory: C:\Users\pc\Downloads\kenny\ai-music-studio
