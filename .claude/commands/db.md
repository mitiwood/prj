Supabase 데이터베이스 작업 스킬.

**Instructions:**
1. `$ARGUMENTS`가 없으면 사용 가능한 명령어 목록을 보여준다:
   - `schema` — 현재 DB 스키마 확인 (supabase-schema.sql 읽기)
   - `query <SQL>` — SQL 쿼리 실행 (SELECT만)
   - `tables` — 테이블 목록 및 행 수 조회
   - `migrate <설명>` — 새 마이그레이션 SQL 생성
   - `check` — 스키마와 코드 간 불일치 탐지

2. `schema` 명령:
   - `api/supabase-schema.sql` 파일 읽기
   - 테이블별 컬럼, 타입, 제약조건 정리하여 표시

3. `query` 명령:
   - SELECT 쿼리만 허용 (INSERT/UPDATE/DELETE 차단)
   - Supabase REST API 또는 코드 내 연결 정보 활용

4. `tables` 명령:
   - 스키마 파일에서 테이블 목록 추출
   - 각 테이블의 구조 요약

5. `migrate` 명령:
   - 사용자 설명에 맞는 ALTER/CREATE SQL 생성
   - `api/supabase-schema.sql`에 추가
   - 변경 전 확인 요청

6. `check` 명령:
   - 코드에서 사용하는 테이블/컬럼명 추출
   - 스키마 파일과 비교하여 불일치 보고

**Rules:**
- 데이터 변경 쿼리(INSERT/UPDATE/DELETE/DROP)는 사용자 명시적 확인 후에만 실행
- Supabase 연결 정보는 환경변수에서 참조 (.env 파일 내용은 출력하지 않음)
- SQL 인젝션 방지: 사용자 입력을 직접 SQL에 넣지 않음
