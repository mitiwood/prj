# 커뮤니티 채팅 기능 문서

> 커뮤니티 채팅 관련 구조, API, 봇 명령어, 주의사항 정리

---

## 1. 아키텍처

### 데이터 저장
| 저장소 | 설명 | 초기화 시점 |
|--------|------|-----------|
| Supabase `chat_messages` 테이블 | 영구 보관 (DB 직접 삭제 전까지) | 봇 `채팅초기화` 명령 또는 DB 직접 삭제 |
| 서버 메모리 `_mem` | Supabase 실패 시 폴백 (최대 500건) | Vercel 콜드 스타트 (5~15분 비활동 후) |

### chat_messages 테이블 스키마
```sql
id BIGSERIAL PRIMARY KEY,
room TEXT DEFAULT 'general',
content TEXT NOT NULL,
author_name TEXT NOT NULL,
author_avatar TEXT DEFAULT '',
author_provider TEXT DEFAULT '',
reply_to JSONB DEFAULT NULL,
created_at TIMESTAMPTZ DEFAULT NOW()
```

---

## 2. API 엔드포인트 (`/api/chat`)

### GET — 메시지 조회
```
GET /api/chat?room=general&limit=80&since=timestamp&user=name&provider=prov
```
- `room`: 채팅방 (기본 `general`)
- `limit`: 메시지 수 (기본 80)
- `since`: 이후 메시지만 (폴링용)
- 응답: `{ ok, messages, insight, typing, pinned }`

### POST — 메시지 전송 / 액션
```json
// 메시지 전송
{ "room": "general", "content": "안녕!", "author_name": "Kenny", "author_avatar": "", "author_provider": "google" }

// 답장
{ "room": "general", "content": "답장!", "author_name": "Kenny", "author_provider": "google", "reply_to": {"name":"상대방","content":"원본"} }

// 타이핑 인디케이터
{ "action": "typing", "author_name": "Kenny" }

// 메시지 삭제
{ "action": "delete", "msgId": "123", "author_name": "Kenny", "author_provider": "google" }

// 메시지 고정
{ "action": "pin", "msgId": "123" }

// 고정 해제
{ "action": "unpin" }
```

---

## 3. 클라이언트 구현 (`index.html`)

### 채팅 모드 진입
- 커뮤니티 필터에서 `💬 채팅` 클릭 → `_commActiveGenre='chat'`
- `_renderCommunityInner`에서 chat 분기 진입
- **표시**: 채팅 UI + 크리에이터 섹션만
- **숨김/제거**: DJ, 차트, 무드, 스포트라이트, 장르, 챌린지, 추천, 활동피드, 히어로, 트랙리스트 (innerHTML 비움)
- **폴링/탭복귀**: 트랙 갱신 API 호출 안 함

### 주요 함수
| 함수 | 설명 |
|------|------|
| `_renderChatUI()` | 채팅 UI HTML 렌더 |
| `_loadChatMessages()` | 메시지 조회 + 폴링 (5초 간격) |
| `_sendChat()` | 메시지 전송 |
| `_chatOnTyping()` | 타이핑 인디케이터 전송 (4초 TTL) |
| `_chatDeleteMsg(msgId)` | 메시지 삭제 (본인만) |
| `_chatPinMsg(msgId)` | 메시지 고정 |
| `_chatSetReply(name, content)` | 답장 설정 |
| `_chatToggleReact(msgId, emoji)` | 이모지 리액션 |

### 메시지 렌더링
- 아바타 + **이름 + 메시지 + 시간**이 버블 안에 가로 배치
- 내 메시지(`mine`): 오른쪽 정렬, 보라색 배경
- 상대 메시지: 왼쪽 정렬, 이름 + provider 아이콘 표시
- 날짜 변경 시 구분선 표시
- 답장 미리보기 (↩ 표시)

### 중복 방지
- 폴링 시 `data-msg-id`로 이미 DOM에 있는 메시지 스킵
- `_chatLastTs`로 이후 메시지만 요청

### 타이핑 인디케이터
- 입력 시 `/api/chat` POST `{action:'typing'}` 전송
- 서버: `_typingUsers` 인메모리 (4초 TTL)
- GET 응답의 `typing` 배열에서 다른 사용자 이름 표시
- `"○○님이 입력 중..."` 채팅 하단에 표시

---

## 4. 봇 명령어

| 명령어 | 설명 |
|--------|------|
| `채팅공지 <메시지>` | 커뮤니티 채팅에 관리자 공지 전송 (📢 prefix) |
| `채팅초기화` / `clearchat` | chat_messages 테이블 전체 삭제 |

### 채팅공지 구현
- `author_name: '관리자'`, `author_provider: 'admin'`으로 DB 직접 삽입
- 봇에서 sbRaw('POST', '/chat_messages', msg) 호출

---

## 5. 주의사항

- **채팅 모드에서 트랙 관련 콘텐츠 절대 불러오지 않음** (폴링/탭복귀 포함)
- 채팅 → 다른 탭 전환 시 채팅 UI DOM 완전 제거
- 메시지 삭제는 본인 메시지만 가능 (author_name + author_provider 일치 확인)
- Rate limit: 30초당 5건 (IP 기반)
- 온라인 유저 트래킹: 5분 윈도우

---

## 6. CSS 클래스

| 클래스 | 설명 |
|--------|------|
| `.comm-chat-msg` | 메시지 행 (flex) |
| `.comm-chat-msg.mine` | 내 메시지 (row-reverse) |
| `.comm-chat-bubble` | 메시지 버블 |
| `.comm-chat-name` | 이름 (inline, 보라색) |
| `.comm-chat-time` | 시간 (inline, 회색) |
| `.comm-chat-avatar` | 아바타 (28px 원형) |
| `.chat-reply-preview` | 답장 미리보기 |
| `.chat-date-sep` | 날짜 구분선 |
| `.chat-actions` | 호버 시 나타나는 액션 버튼 |
| `.chat-reaction` | 이모지 리액션 |
| `.comm-chat-container` | 채팅 전체 래퍼 |
