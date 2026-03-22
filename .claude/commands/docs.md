프로젝트 문서 통합 조회·검색·요약 스킬. docs/ 폴더와 루트 문서를 자연어로 탐색한다.

사용자 질문: $ARGUMENTS

**Instructions:**

1. 사용자 입력을 분석하여 **명령 모드**를 판별한다:

   | 명령 | 동작 |
   |------|------|
   | `list` 또는 빈 입력 | 전체 문서 목록 + 한줄 요약 테이블 |
   | `search <키워드>` | 모든 문서에서 키워드 Grep 검색 → 매칭 파일·줄번호 표시 |
   | `read <문서명>` | 해당 문서 전문 출력 |
   | `summary <문서명>` | 해당 문서 핵심 요약 (섹션별 2~3줄) |
   | `diff` | 최근 24시간 내 변경된 문서 목록 + git diff 요약 |
   | 자연어 질문 | 아래 키워드 매핑으로 관련 문서를 찾아 답변 |

2. **자연어 키워드 매핑** — 질문에 포함된 키워드로 문서를 자동 매칭:

   | 키워드 | 문서 |
   |--------|------|
   | api, 엔드포인트, 라우트, endpoint | docs/API_ARCHITECTURE.md |
   | 시퀀스, 플로우, 흐름, flow, 다이어그램 | docs/SEQUENCE_DIAGRAM.md |
   | 스토리보드, 화면, ux, 유저플로우 | docs/STORYBOARD.md |
   | 작업, 계획, 일정, phase, 마일스톤 | docs/WORK_PLAN.md |
   | 정책, 보안, 과금, 운영, policy | docs/POLICY.md |
   | 로드맵, roadmap, 비전, 목표 | docs/ROADMAP.md |
   | 커뮤니티, 레이아웃, community | docs/community-layout.md |
   | 탭, tab, 네비게이션, 구조 | docs/tab-structure.md |
   | 변경, 이력, changelog, 업데이트 | docs/changelog-20260322.md |
   | 규칙, claude, 가이드, 컨벤션 | CLAUDE.md |
   | kie, 음악api, api레퍼런스 | KIE_API_REFERENCE.md |
   | 스펙, 기능, 명세, spec | SPEC.md |
   | 전체, 목록, 문서 | 전체 문서 목록 표시 |

3. **문서를 Read 도구로 읽고** 관련 섹션을 출력한다.
   - 질문이 구체적이면 → 해당 섹션만 발췌
   - 질문이 모호하면 → 목차(헤더 목록)를 먼저 보여주고 선택 유도
   - 여러 문서에 걸친 질문이면 → 각 문서에서 관련 부분을 모아서 통합 답변

4. **검색 모드** (`search`) 실행 방법:
   - Grep 도구로 `docs/` 폴더 + 루트 .md 파일에서 키워드 검색
   - 매칭 결과를 `파일명:줄번호 — 내용` 형식으로 표시
   - 매칭 수가 20줄 초과 시 상위 20건만 표시하고 "... 외 N건" 안내

5. **diff 모드** 실행 방법:
   - `git diff --name-only HEAD~5 -- docs/ *.md` 로 최근 변경 문서 확인
   - 변경된 문서별 `git diff HEAD~5 -- <파일>` 요약

**Output Format:**

```
📄 문서 조회 결과
━━━━━━━━━━━━━━━━━━━━

[내용]

━━━━━━━━━━━━━━━━━━━━
📁 소스: <파일명> (줄 X~Y)
```

**Examples:**
- `/docs` → 전체 문서 목록 테이블
- `/docs list` → 전체 문서 목록 테이블
- `/docs search 결제` → 모든 문서에서 "결제" 검색
- `/docs read API_ARCHITECTURE` → API 문서 전문
- `/docs summary ROADMAP` → 로드맵 핵심 요약
- `/docs diff` → 최근 변경된 문서 diff 요약
- `/docs 결제 플로우가 어떻게 돼?` → SEQUENCE_DIAGRAM.md 결제 섹션
- `/docs Phase 2 일정` → WORK_PLAN.md Phase 2 섹션
- `/docs 탭 구조 알려줘` → tab-structure.md 전문

**Rules:**
- 문서 파일 내용만 기반으로 답변 — 추측하지 않는다
- 없는 내용은 "해당 문서에 없는 정보입니다" 로 명확히 안내
- `read` 모드에서는 요약하지 않고 원문 출력
- `summary` 모드에서는 섹션별 2~3줄로 압축
- 검색 결과가 없으면 유사 키워드를 제안
- Working directory: C:\Users\pc\Downloads\kenny\ai-music-studio
