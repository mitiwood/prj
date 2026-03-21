---
name: QA 리포트 표 형식 필수
description: QA 결과는 항상 유니코드 박스 테이블로 텔레그램+카카오에 전송
type: feedback
---

QA 결과 리포트는 항상 유니코드 박스 드로잉 테이블 형식으로 작성하여 텔레그램 + 카카오에 동시 전송한다.

**Why:** 사용자가 표 형태로 한눈에 보기 원함. 기존 줄글 방식은 가독성이 떨어짐.

**How to apply:**
- 유니코드 박스 문자(┌├└│─┼┬┴┐┤┘) 사용
- 결과 컬럼: ✅ 정상 / 🔧 수정 / ❌ 실패
- 텔레그램: parse_mode='' (plain text), Python urllib
- 카카오: /api/kakao-notify로 동일 메시지 전송
- curl 사용 금지 — Python 인코딩만 사용
