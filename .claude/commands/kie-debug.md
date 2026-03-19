kie.ai API 디버깅 및 연동 상태 점검 스킬.

**Instructions:**
1. kie.ai 관련 파일 스캔:
   - `api/kie.js`, `api/kie-proxy.js` 읽기
   - `index.html`에서 kie.ai 호출 패턴 추출

2. API 엔드포인트 테스트:
   - `/api/kie` 응답 확인 (HTTP 상태, Content-Type)
   - `/api/kie-proxy` 응답 확인
   - HTML 응답 vs JSON 응답 구분 (과거 반복 버그)

3. 공통 오류 패턴 점검:
   - HTML 응답을 JSON으로 파싱 시도하는 코드 탐지
   - callBackUrl 파라미터 누락/잘못된 값
   - 인증 토큰 전달 방식 확인
   - 타임아웃 설정 확인
   - 에러 핸들링 누락 지점

4. 폴링 로직 분석:
   - 폴링 간격 및 최대 대기 시간
   - 실패 시 재시도 로직
   - 적응형 폴링 동작 여부

5. 결과 보고:
   ```
   🔍 kie.ai API 디버깅 결과

   📡 엔드포인트 상태:
   - /api/kie: ✅/❌ (상태코드, Content-Type)
   - /api/kie-proxy: ✅/❌

   ⚠️ 발견된 문제:
   - [파일:라인] 설명

   🔄 폴링 설정:
   - 간격: Ns, 최대: Ns, 적응형: ✅/❌

   💡 권장 수정사항:
   - ...
   ```

**Rules:**
- 실제 kie.ai 외부 API는 호출하지 않음 (비용 발생 방지)
- Vercel 배포된 /api/ 엔드포인트만 테스트
- API 키/시크릿은 출력하지 않음
