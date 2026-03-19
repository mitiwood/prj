index.html 모듈 분리 스킬. 단일 대형 HTML 파일을 CSS/JS 외부 파일로 분리한다.

**Instructions:**
1. 현재 상태 분석:
   - `index.html` 총 라인 수 및 크기
   - `<style>` 블록 개수와 각 크기
   - `<script>` 블록 개수와 각 크기
   - 순수 HTML 비율

2. 분리 계획 수립:
   - CSS: 모든 `<style>` 내용 → `css/style.css` (또는 기능별 분리)
   - JS: 모든 `<script>` 내용 → 기능별 JS 파일
     - `js/app.js` — 메인 앱 로직
     - `js/audio.js` — 오디오 플레이어
     - `js/community.js` — 커뮤니티 기능
     - `js/auth.js` — 인증 관련
     - (기능 분석 후 적절히 분류)
   - HTML: `<link>`와 `<script src>` 태그로 교체

3. 분리 계획을 사용자에게 보여주고 확인 요청

4. 확인 후 실행:
   - 디렉토리 생성 (`css/`, `js/`)
   - 파일 분리 및 작성
   - `index.html`에서 인라인 코드 → 외부 참조로 교체
   - 동작 검증 (문법 오류 체크)

5. 결과 보고:
   ```
   📦 모듈 분리 결과

   Before: index.html (444KB, 9226줄)
   After:
   - index.html (NKB, N줄) — 순수 HTML
   - css/style.css (NKB)
   - js/app.js (NKB)
   - js/audio.js (NKB)
   - ...

   총 크기 변화: 444KB → NKB (캐싱 효과로 체감 개선)
   ```

**Rules:**
- 분리 전 반드시 사용자 확인
- 기능이 깨지지 않도록 의존성 순서 유지
- 전역 변수/함수 참조 관계 분석 후 분리
- admin/admin.html은 별도 요청 시에만 처리
