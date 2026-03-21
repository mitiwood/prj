프로젝트 기획 문서 조회 스킬. 자연어로 질문하면 docs/ 폴더의 해당 문서를 찾아 답변한다.

사용자 질문: $ARGUMENTS

**Instructions:**

1. 사용자 질문을 분석하여 해당 문서를 찾는다:

   | 키워드 | 문서 |
   |--------|------|
   | 기능, 명세, 스펙, spec | SPEC.md |
   | 시퀀스, 플로우, 흐름, flow | docs/SEQUENCE_DIAGRAM.md |
   | api, 구조, 아키텍처, endpoint | docs/API_ARCHITECTURE.md |
   | 스토리보드, 화면, 유저플로우, ux | docs/STORYBOARD.md |
   | 작업, 계획, 일정, phase, 마일스톤 | docs/WORK_PLAN.md |
   | 정책, 보안, 과금, 운영, policy | docs/POLICY.md |
   | kie, api레퍼런스, 음악api | KIE_API_REFERENCE.md |
   | 변경, 이력, changelog | CHANGELOG_2026-03-21.md |
   | 규칙, claude, 가이드 | CLAUDE.md |
   | 전체, 목록, 문서 | 전체 문서 목록 표시 |

2. 해당 문서를 Read 도구로 읽고 관련 섹션을 출력한다.

3. 질문이 구체적이면 해당 부분만, 모호하면 목차를 보여준다.

**Examples:**
- "시퀀스" → SEQUENCE_DIAGRAM.md 전체
- "결제 플로우" → SEQUENCE_DIAGRAM.md 결제 섹션
- "Phase 2 뭐야" → WORK_PLAN.md Phase 2 섹션
- "보안 정책" → POLICY.md 보안 정책 섹션
- "전체 문서" → 모든 문서 파일 목록

**Rules:**
- 문서 파일 내용만 기반으로 답변
- 없는 내용은 "해당 문서에 없는 정보입니다"
- 요약하지 말고 원문 출력
