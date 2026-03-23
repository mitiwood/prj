# 채팅 시스템 (확정)

> 2026-03-24 확정. 변경 시 사용자 확인 필요.

---

## 아키텍처

| 항목 | 구현 |
|---|---|
| **메시지 저장** | Supabase `chat_messages` 테이블 |
| **메시지 수신** | 1초 폴링 + Supabase Realtime 백그라운드 시도 |
| **타이핑 인디케이터** | Supabase `chat_typing` 테이블 (4초 TTL) |
| **고정 메시지** | 서버 인메모리 (세션 유지) |
| **반복 방지** | 같은 내용 3초 내 재전송 차단 |

## API

### `/api/chat`

- **GET** `?room=general&limit=80&since=timestamp`
  - 응답: `{ messages, insight, typing, pinned }`
  - `typing`: 4초 내 입력 중인 사용자 이름 배열 (DB 조회)
  - `pinned`: 고정 메시지 객체

- **POST**
  - `action: 'typing'` → `chat_typing` 테이블 upsert
  - `action: 'pin'` + `msgId` → 메시지 고정
  - `action: 'unpin'` → 고정 해제
  - `action: 'delete'` + `msgId` → 메시지 삭제
  - (기본) → 메시지 전송 + 답글 푸시 알림

### `/api/supabase-config`

- anon key 제공 (Realtime 연결용)
- `Cache-Control: no-store`
- 값에 `.trim()` 적용

## Supabase Realtime

- `chat_messages` 테이블 Realtime publication 활성화됨
- RLS 정책: SELECT/INSERT/DELETE 모두 허용
- REPLICA IDENTITY FULL 설정됨
- 클라이언트: `@supabase/supabase-js` CDN 동적 로드
- 연결 성공 시 1초 폴링 자동 스킵
- 연결 실패 시 1초 폴링 폴백

## 타이핑 인디케이터

- **저장**: `chat_typing` 테이블 (user_name PK, updated_at)
- **이유**: Vercel serverless가 stateless → 인메모리 불가
- **흐름**: 입력 시작 → `/api/chat` POST typing → DB upsert → 1초 폴링으로 다른 사용자가 조회
- **TTL**: 4초 (3초마다 재전송, 4초 넘으면 표시 안 함)

## 폴링 주기

| 상태 | 주기 |
|---|---|
| Realtime 연결됨 | 폴링 없음 (WebSocket 즉시) |
| Realtime 미연결 | **1초** |
| 탭 비활성 | 폴링 중지 |

## 기능 목록

- 메시지 전송/수신 (1초 내)
- 답글 (reply_to)
- 이모지 리액션 (로컬)
- 이모지 피커
- 메시지 삭제 (본인만)
- 메시지 고정 (📌)
- 타이핑 인디케이터 ("○○님이 입력 중...")
- 반복 메시지 차단 (3초)
- 날짜 구분선 (오늘/어제/날짜)
- 새 메시지 배지
- 자동 스크롤
- 접속자 수/오늘 메시지/참여자/MVP 인사이트
- 답글 시 웹 푸시 알림

## 주의사항

- Vercel serverless는 stateless → 인메모리 상태는 인스턴스 간 공유 불가
- 고정 메시지는 인메모리 → 서버 재시작 시 초기화됨
- anon key에 줄바꿈이 포함되면 WebSocket 연결 실패 → 서버+클라이언트 양쪽 trim 필수
