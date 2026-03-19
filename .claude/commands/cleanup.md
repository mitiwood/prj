프로젝트 파일 정리 및 레거시 코드 탐지 스킬.

**Instructions:**
1. 중복/백업 HTML 파일 탐지:
   - `backup_index.html`, `-index.html`, `index_TAB.html`, `darkmode-index.html`, `리뉴얼전_index.html` 등
   - 각 파일의 크기와 마지막 수정일 표시
   - 현재 `index.html`과의 차이점 요약

2. 사용하지 않는 파일 탐지:
   - 어디서도 참조되지 않는 JS/CSS 파일
   - 고아 API 엔드포인트 (프론트엔드에서 호출하지 않는 API)

3. 대용량 파일 분석:
   - 10KB 이상 파일 목록 (크기순 정렬)
   - `index.html` 크기 분석 및 분리 가능한 부분 제안

4. 결과 보고:
   ```
   📦 프로젝트 현황
   - 총 파일 수: N개
   - 총 크기: NMB

   🗑️ 삭제 추천 (백업/레거시):
   - backup_index.html (150KB, 2025-03-08)
   - ...

   ⚠️ 미사용 의심 파일:
   - ...

   📏 대용량 파일 TOP 10:
   - index.html (444KB)
   - ...
   ```

5. 사용자 확인 후 삭제 실행

**Rules:**
- 절대 확인 없이 파일을 삭제하지 않는다
- `.env`, `.git`, `node_modules`는 분석에서 제외
- 삭제 전 파일 내용 요약을 보여준다
