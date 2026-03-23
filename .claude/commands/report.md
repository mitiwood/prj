수정 완료 후 변경 내역을 피드백 리포트로 작성하여 텔레그램 + 카카오로 전송하는 스킬.

**Instructions:**
1. `git diff HEAD~1 --stat`과 `git log -1 --format=%s`로 직전 커밋의 변경 내역을 파악한다
2. 변경 내역을 분석하여 아래 형식의 리포트를 작성한다:

```
📋 수정 피드백 리포트

🔖 커밋: <hash 7자리> <커밋 메시지>
📅 일시: <YYYY-MM-DD HH:MM>

📝 변경 내용:
• <변경사항 1>
• <변경사항 2>
• ...

📁 변경 파일:
• <파일명 1> (+N -N)
• <파일명 2> (+N -N)

🔍 원인/배경:
<왜 이 변경이 필요했는지 1~2줄>

✅ 검증:
• 문법 체크: OK/FAIL
• 배포 상태: 완료/대기
```

3. Python을 사용하여 텔레그램 + 카카오로 동시 전송한다:
   - 텔레그램: `/api/telegram` (parse_mode: 'HTML', UTF-8 인코딩)
   - 카카오: `/api/kakao-notify`
   - URL: `https://ai-music-studio-bice.vercel.app`
4. 전송 결과를 사용자에게 보고한다

**Rules:**
- 텔레그램 parse_mode는 반드시 'HTML' (Markdown 금지)
- 한글 텍스트는 UTF-8 인코딩 필수
- curl 대신 Python urllib 사용
- 리포트 텍스트는 300자 이내로 요약 (카카오 제한)
- Working directory: C:\Users\pc\Downloads\kenny\ai-music-studio
