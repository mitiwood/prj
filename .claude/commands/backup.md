주요 파일 스냅샷 백업 스킬. 대형 파일 변경 전 안전장치.

**Instructions:**
1. `$ARGUMENTS`가 없으면 주요 파일 자동 백업:
   - `index.html` (메인 앱)
   - `admin/admin.html` (관리자)
   - `api/` 디렉토리 전체

2. `$ARGUMENTS`가 있으면 지정된 파일만 백업

3. 백업 방식 (Git 태그 기반):
   - 현재 상태를 태그로 저장: `backup/YYYY-MM-DD-HHmm`
   - `git tag -a backup/YYYY-MM-DD-HHmm -m "Backup before <작업 설명>"`
   - 변경사항이 있으면 임시 커밋 후 태그 → 복원 시 사용

4. 기존 백업 목록:
   - `git tag -l "backup/*"` 로 백업 태그 목록 표시
   - 각 태그의 날짜와 메시지 표시

5. 복원 기능:
   - `/backup restore <태그명>` → 해당 시점으로 파일 복원
   - `git show <태그>:<파일경로>` 로 특정 파일만 복원 가능
   - 복원 전 현재 상태 자동 백업

6. 결과 보고:
   ```
   💾 백업 완료

   태그: backup/2026-03-19-2330
   포함 파일:
   - index.html (444KB)
   - admin/admin.html (150KB)
   - api/ (12 files)

   복원 명령: /backup restore backup/2026-03-19-2330
   ```

**Rules:**
- Git 히스토리를 활용하므로 별도 백업 파일 생성하지 않음
- 백업 태그는 로컬에만 저장 (push하지 않음)
- 복원 시 현재 변경사항 유실 방지를 위해 먼저 stash 또는 커밋
