라이브 사이트 및 API 엔드포인트 헬스체크 스킬.

**Instructions:**
1. 메인 사이트 응답 확인:
   - `curl -s -o /dev/null -w "%{http_code}" https://ai-music-studio-bice.vercel.app`
   - 응답 시간 측정: `curl -s -o /dev/null -w "%{time_total}" https://ai-music-studio-bice.vercel.app`

2. API 엔드포인트 상태 체크 (각각 HTTP 상태코드 확인):
   - `/api/tracks`
   - `/api/users`
   - `/api/auth`
   - `/api/kie`
   - `/api/logs`
   - `/api/push-subscribe`
   - `/api/analyze`
   - `/api/yt-analyze`
   - `/api/share`

3. Admin 페이지 확인:
   - `/admin/admin.html`

4. 결과 보고 (테이블 형식):
   ```
   | Endpoint | Status | 응답시간 |
   |----------|--------|----------|
   | / (메인) | ✅ 200 | 0.45s   |
   | /api/tracks | ✅ 200 | 0.12s |
   | ...      |        |          |
   ```
   - ❌ 표시: 4xx/5xx 에러
   - ⚠️ 표시: 응답시간 > 3초
   - ✅ 표시: 정상

**Rules:**
- 타임아웃: 각 요청 10초
- 실패한 엔드포인트는 응답 본문 일부를 포함하여 디버깅 단서 제공
- GET 요청만 사용 (부작용 없는 체크만)
