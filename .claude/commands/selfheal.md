자가 치유 배포 스킬. 배포 후 헬스체크 → 실패 시 자동 진단 + 수정 + 재배포.

**Instructions:**

1. 현재 변경사항 커밋 + 푸시:
   - `git add` (관련 파일만)
   - `git commit` (변경 내용 기반 메시지)
   - `git push origin main`

2. Vercel 배포:
   - `npx vercel --prod --yes`

3. 헬스체크 (5개 엔드포인트):
   - `https://ai-music-studio-bice.vercel.app` (200?)
   - `/api/config` (200?)
   - `/api/toss-config` (200?)
   - `/api/announcement` (200?)
   - `/api/tracks?public=true` (200?)

4. 전부 통과 → 텔레그램+카카오 "✅ 배포 완료" 알림

5. 실패 시:
   - Vercel 로그 확인 (`npx vercel logs`)
   - 에러 원인 분석
   - 자동 수정 시도 (1회)
   - 재배포 + 재헬스체크
   - 여전히 실패 → 이전 커밋으로 롤백 + "🚨 롤백" 알림

**Rules:**
- 헬스체크 2개 이상 실패 시만 롤백
- 롤백은 `git revert HEAD --no-edit` 사용 (force push 금지)
- 매 단계 텔레그램 진행 상황 알림
