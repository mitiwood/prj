저장된 버전 스냅샷 목록을 조회하는 스킬.

**Instructions:**
1. `git tag -l "snapshot/*" --sort=-creatordate`로 스냅샷 태그 목록 조회
2. 각 태그의 커밋 해시, 날짜, 메시지를 `git log -1 --format="%h|%ci|%s" <태그>`로 가져온다
3. 테이블로 표시:
   ```
   | # | 버전명 | 커밋 | 날짜 | 메시지 |
   |---|--------|------|------|--------|
   ```
4. 태그가 없으면 "저장된 스냅샷이 없습니다. `/snapshot save 이름`으로 저장하세요" 표시
5. 하단에 안내:
   - `/snapshot save 이름` — 현재 상태 저장
   - `/snapshot restore 번호` — 해당 버전으로 복원
   - `/snapshot delete 번호` — 스냅샷 삭제

**Rules:**
- 읽기 전용 — 태그를 생성/삭제하지 않는다
- Working directory: C:\Users\pc\Downloads\kenny\ai-music-studio
