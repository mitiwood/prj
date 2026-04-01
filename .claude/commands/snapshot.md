버전 스냅샷 관리 스킬. 현재 상태를 태그로 저장하고, 저장된 버전 목록을 보여주고, 선택한 버전으로 되돌린다.

**Instructions:**

`$ARGUMENTS`에 따라 분기:

## 1. 저장 (`/snapshot save [이름]`)
- 현재 커밋에 태그를 생성한다
- 태그명: `snapshot/YYYY-MM-DD-HH-mm--이름` (이름 없으면 `auto`)
- 예: `snapshot/2026-03-29-14-30--toss-ui-완성`
- `git tag <태그명>` + `git push origin <태그명>`
- 결과: "📌 스냅샷 저장: <태그명> (커밋: <hash>)"

## 2. 목록 (`/snapshot list` 또는 인자 없음)
- `git tag -l "snapshot/*" --sort=-creatordate`로 스냅샷 태그 목록 조회
- 각 태그의 커밋 해시, 날짜, 메시지를 테이블로 표시:
  ```
  | # | 버전명 | 커밋 | 날짜 | 메시지 |
  |---|--------|------|------|--------|
  | 1 | toss-ui-완성 | eb0162c | 03-29 14:30 | fix: MV 영상... |
  ```
- 태그가 없으면 "저장된 스냅샷이 없습니다. `/snapshot save 이름`으로 저장하세요"

## 3. 복원 (`/snapshot restore [번호 또는 태그명]`)
- 목록에서 번호 또는 태그명으로 선택
- 해당 태그의 커밋으로 새 브랜치 생성하지 않고, **안전한 revert 방식** 사용:
  - 현재 커밋과 스냅샷 커밋 사이의 diff를 보여준다
  - 사용자 확인 후 `git revert --no-commit <현재>..HEAD` 실행
  - 또는 간단히: 해당 커밋의 파일 상태를 checkout하고 새 커밋 생성
    - `git checkout <snapshot-hash> -- .`
    - `git commit -m "restore: snapshot/<이름>으로 복원"`
  - `git push origin main`
- 결과: "⏪ 스냅샷 복원: <태그명> → 새 커밋 <hash>"

## 4. 삭제 (`/snapshot delete [번호 또는 태그명]`)
- `git tag -d <태그명>` + `git push origin --delete <태그명>`
- 결과: "🗑 스냅샷 삭제: <태그명>"

**Rules:**
- `git reset --hard` 절대 사용 금지 (히스토리 보존)
- 복원 전 반드시 변경될 내용을 사용자에게 보여주고 확인 받기
- Working directory: C:\Users\pc\Downloads\kenny\ai-music-studio
- 인자 없이 `/snapshot`만 실행하면 목록(list) 표시
