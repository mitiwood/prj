사이트 성능 분석 스킬.

**Instructions:**
1. 파일 크기 분석:
   - HTML/JS/CSS 파일별 크기 측정
   - 인라인 스크립트/스타일 크기 분리 계산
   - `index.html` 상세 분석 (HTML/CSS/JS 비율)

2. 로딩 성능 체크:
   - `curl`로 메인 페이지 TTFB(Time To First Byte) 측정
   - Gzip/Brotli 압축 여부 확인
   - 캐시 헤더 확인 (Cache-Control, ETag)

3. 코드 레벨 성능 분석:
   - DOM 요소 수 추정 (HTML 태그 카운트)
   - 이벤트 리스너 패턴 분석
   - setInterval/setTimeout 사용 현황
   - 대용량 데이터 처리 패턴 (페이지네이션, 가상 스크롤 등)
   - 이미지/미디어 최적화 여부

4. API 성능:
   - 각 API 엔드포인트 응답 시간 측정
   - 불필요한 API 호출 패턴 탐지
   - 폴링 주기 분석

5. 최적화 제안:
   ```
   📊 성능 분석 결과

   📦 번들 크기:
   - index.html: 444KB (HTML: N%, CSS: N%, JS: N%)
   - 권장: CSS/JS 외부 파일 분리

   ⚡ 로딩 성능:
   - TTFB: Ns
   - 압축: ✅/❌
   - 캐시: ✅/❌

   🔧 최적화 제안 (영향도순):
   1. [높음] CSS/JS 파일 분리 → 번들 크기 N% 감소 예상
   2. [중간] 이미지 lazy loading 적용
   3. ...

   예상 개선 효과: 로딩 시간 N초 → N초
   ```

**Rules:**
- 분석만 수행, 코드 수정은 하지 않음
- 구체적 수치 기반 제안 (추상적 조언 지양)
- 실행 가능한 개선 방안만 제안
