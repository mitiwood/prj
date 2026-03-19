OAuth 인증 플로우 점검 스킬. Google/Kakao/Naver 3개 프로바이더 상태를 확인한다.

**Instructions:**
1. 인증 관련 파일 분석:
   - `api/auth/` 디렉토리 전체 읽기
   - `api/auth/index.js` — 메인 라우터
   - `api/auth/google.js` — Google OAuth
   - `api/auth/kakao/` — Kakao OAuth
   - `api/auth/naver/` — Naver OAuth
   - `index.html`에서 로그인 관련 코드 추출

2. 각 프로바이더별 점검:
   - OAuth redirect URI 설정 확인
   - 콜백 URL 일관성 (localhost vs 프로덕션)
   - 토큰 처리 로직 (액세스 토큰, 리프레시 토큰)
   - 에러 핸들링 (인증 실패, 토큰 만료)
   - CORS 설정

3. 엔드포인트 응답 테스트:
   - `curl` 으로 `/api/auth` 응답 확인
   - 각 프로바이더 로그인 URL 생성 확인
   - 콜백 엔드포인트 존재 확인

4. 보안 점검:
   - client_secret 노출 여부
   - state 파라미터 CSRF 방어
   - 토큰 저장 방식 (localStorage vs httpOnly cookie)
   - 세션 관리 방식

5. 결과 보고:
   ```
   🔐 인증 플로우 점검 결과

   | 프로바이더 | 엔드포인트 | 리다이렉트 | 콜백 | 보안 |
   |-----------|-----------|-----------|------|------|
   | Google    | ✅        | ✅        | ✅   | ⚠️  |
   | Kakao     | ✅        | ✅        | ✅   | ✅   |
   | Naver     | ✅        | ❌        | ✅   | ✅   |

   ⚠️ 발견된 이슈:
   - ...

   💡 권장사항:
   - ...
   ```

**Rules:**
- 실제 OAuth 플로우를 실행하지 않음 (코드 분석 + 엔드포인트 존재 확인만)
- client_secret, API 키 등 민감 정보는 절대 출력하지 않음
- 환경변수 참조 여부만 확인 (값은 확인하지 않음)
