# kie.ai API Reference

> **공식 문서:** https://docs.kie.ai/
> **마켓 (모델 목록):** https://kie.ai/market
> **가격:** https://kie.ai/pricing
> **API 키 관리:** https://kie.ai/api-key
> **로그/작업 내역:** https://kie.ai/logs
> **최종 검증일:** 2026-03-21

---

## 1. 기본 정보

| 항목 | 내용 |
|------|------|
| **Base URL** | `https://api.kie.ai` |
| **인증** | `Authorization: Bearer {API_KEY}` |
| **Content-Type** | `application/json` |
| **크레딧 단가** | $0.005 USD / 크레딧 (5~10% 보너스 SKU 있음) |
| **Rate Limit** | 10초당 20건 (약 100+ 동시 작업) / 초과 시 HTTP 429 |
| **데이터 보존** | 생성 미디어 14일, 로그 2개월 |
| **작업 방식** | 비동기 — 요청 시 task_id 반환, 폴링 또는 콜백으로 결과 수신 |

---

## 2. 음악 생성 (Suno)

### 2.1 음악 생성

```
POST /api/v1/generate
```

**Request Body:**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `prompt` | string | ✅ | 가사 또는 스타일 설명 |
| `customMode` | boolean | - | 커스텀 모드 (true 시 style 파라미터 활성) |
| `instrumental` | boolean | - | 인스트루멘탈 (보컬 없음) |
| `model` | string | - | `V3_5`, `V4`, `V4_5`, `V4_5PLUS` |
| `style` | string | - | 장르, 무드, 악기 등 스타일 태그 (customMode=true 시) |
| `title` | string | - | 곡 제목 |
| `vocalGender` | string | - | `male`, `female` (instrumental=false 시) |
| `negativeTags` | string | - | 제외할 스타일 태그 |
| `styleWeight` | number | - | 스타일 강도 (0.0~1.0) |
| `weirdnessConstraint` | number | - | 창의성 (0.0~1.0) |
| `callBackUrl` | string | ✅ | 완료 시 콜백 URL |

**Response:**
```json
{
  "data": {
    "taskId": "abc123..."
  }
}
```

**폴링:**
```
GET /api/v1/generate/record-info?taskId={taskId}
```

**폴링 응답:**
```json
{
  "data": {
    "status": "SUCCESS",
    "response": {
      "sunoData": [
        {
          "id": "track-id",
          "audioUrl": "https://...",
          "imageUrl": "https://...",
          "title": "곡 제목",
          "duration": 120,
          "lyric": "[Verse]\n가사...",
          "tags": "K-Pop, Dance"
        }
      ]
    }
  }
}
```

**상태값:** `SUCCESS`, `COMPLETE`, `FAILED`, `ERROR`

> **참고:** `duration` 파라미터는 API에서 무시됨. AI가 자동으로 곡 길이 결정.
> 긴 곡이 필요하면 extend API 사용.

---

### 2.2 곡 연장 (Extend)

```
POST /api/v1/generate/extend
```

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `audioId` | string | ✅ | 연장할 트랙 ID |
| `model` | string | - | 모델 선택 |
| `callBackUrl` | string | ✅ | 콜백 URL |
| `prompt` | string | - | 연장 방향 설명 |
| `continueAt` | number | - | 이어붙일 시작 지점 (초) |
| `defaultParamFlag` | boolean | - | prompt 제공 시 true |

**폴링:** `GET /api/v1/generate/record-info?taskId={taskId}`

---

### 2.3 보컬 변환 (Add Vocals)

```
POST /api/v1/generate/add-vocals
```

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `uploadUrl` | string | ✅ | 원본 오디오 URL |
| `prompt` | string | - | 보컬 스타일 설명 |
| `model` | string | - | 모델 선택 |
| `callBackUrl` | string | ✅ | 콜백 URL |
| `title` | string | - | 곡 제목 |
| `style` | string | - | 스타일 태그 |
| `vocalGender` | string | - | `male`, `female` |

**폴링:** `GET /api/v1/generate/record-info?taskId={taskId}`

---

### 2.4 타임스탬프 가사 (Karaoke)

```
POST /api/v1/generate/get-timestamped-lyrics
```

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `taskId` | string | ✅ | 곡 생성 태스크 ID |
| `audioId` | string | ✅ | 트랙 ID |

**응답:**
```json
{
  "data": {
    "alignedWords": [
      { "word": "가사", "start": 1.2, "end": 1.8 }
    ]
  }
}
```

---

## 3. 가사 생성 (Lyrics)

```
POST /api/v1/lyrics
```

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `prompt` | string | ✅ | 가사 주제/스타일 설명 |
| `callBackUrl` | string | ✅ | **필수!** 없으면 422 에러 |

**폴링 (2개 경로, 폴백 순서):**
```
GET /api/v1/lyrics/record-info?taskId={taskId}
GET /api/v1/jobs/recordInfo?taskId={taskId}    ← 폴백
```

**응답 (다중 경로 파싱 필요):**
```json
// 경로 1
{ "data": { "response": { "data": [{ "text": "[Verse]\n가사..." }] } } }

// 경로 2
{ "data": { "response": { "text": "[Verse]\n가사..." } } }

// 경로 3
{ "data": { "text": "[Verse]\n가사..." } }
```

> **주의:** 응답의 0번째 배열 요소에 `\ufffd` 인코딩 아티팩트가 포함될 수 있음.
> 한국어/영어 유효성 검사 후 사용 권장.

---

## 4. 비디오 생성 (Kling)

```
POST /api/v1/jobs/createTask
```

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `model` | string | ✅ | `kling-2.6/text-to-video` |
| `input.prompt` | string | ✅ | 영상 설명 |
| `input.aspect_ratio` | string | - | `16:9`, `9:16`, `1:1` |
| `input.duration` | string | - | `5` 또는 `10` (초) |
| `input.sound` | boolean | - | 사운드 포함 여부 |

**폴링:**
```
GET /api/v1/jobs/recordInfo?taskId={taskId}
```

**응답:**
```json
{
  "data": {
    "state": "SUCCESS",
    "resultJson": {
      "resultUrls": ["https://...video.mp4"]
    }
  }
}
```

**상태값:** `PROCESSING`, `SUCCESS`, `FAILED`, `ERROR`

---

## 5. Chat Completion (LLM)

```
POST /{model}/v1/chat/completions
```

OpenAI 호환 포맷. 스트리밍 지원.

**지원 모델 (2026-03-21 확인):**

| 모델 | 크레딧 | 상태 |
|------|--------|------|
| `gemini-2.5-flash` | 0.01~0.07 | ✅ 작동 (현재 사용 중) |
| `claude-sonnet-4-5` | - | ❌ 비지원 ("model is empty") |
| `gpt-4o-mini` | - | ❌ 비지원 |
| `deepseek-chat` | - | ❌ 비지원 |

**예시:**
```bash
curl -X POST https://api.kie.ai/gemini-2.5-flash/v1/chat/completions \
  -H "Authorization: Bearer {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [
      {"role": "system", "content": "You are a music expert."},
      {"role": "user", "content": "비 오는 날 듣기 좋은 재즈 곡 추천해줘"}
    ],
    "max_tokens": 500,
    "stream": false
  }'
```

**스트리밍:** `"stream": true` → SSE 형식 응답

---

## 6. 사용 가능한 모델 목록

### 음악 (Suno)

| 모델 ID | 설명 |
|---------|------|
| `V3_5` | 빠른 생성, 기본 품질 |
| `V4` | 중간 품질 |
| `V4_5` | 권장 (표준) |
| `V4_5PLUS` | 최고 품질, 최대 8분 |

### 비디오

| 모델 ID | 설명 |
|---------|------|
| `kling-2.6/text-to-video` | 텍스트 → 비디오 (5초/10초) |
| `runway` | Runway API (720P/1080P) |
| `veo-3.1-fast` | Google Veo 빠른 생성 |
| `veo-3.1-quality` | Google Veo 고품질 |

### 이미지

| 모델 ID | 설명 |
|---------|------|
| `flux-kontext-pro` | Flux 이미지 생성 |
| `midjourney` | Midjourney |
| `dall-e-4o` | DALL-E 4o |

### 채팅 (LLM)

| 모델 ID | 설명 |
|---------|------|
| `gemini-2.5-flash` | ✅ 유일하게 작동 확인된 모델 |

---

## 7. 에러 코드

| HTTP | 코드/메시지 | 설명 |
|------|------------|------|
| 200 | `SENSITIVE_WORD_ERROR` | 가사에 부적절한 단어 포함 |
| 401 | Unauthorized | API 키 무효/만료 |
| 402/403 | credit/permission | 크레딧 부족 또는 권한 없음 |
| 422 | Validation Error | 필수 파라미터 누락 (callBackUrl 등) |
| 429 | Rate Limited | 10초당 20건 초과 |
| 500 | "model is empty" | 지원하지 않는 모델 |

---

## 8. 폴링 전략 (권장)

```
0~3회:   500ms 간격
4~10회:  1,000ms 간격
11~40회: 2,000ms 간격
41회~:   3,000ms 간격
최대:    60~90회 (2~3분)
```

> 곡 생성은 보통 30~60초, MV는 1~2분 소요.

---

## 9. 콜백 (Webhook)

| 항목 | 내용 |
|------|------|
| 파라미터 | `callBackUrl` (각 요청에 포함) |
| 방식 | 작업 완료 시 kie.ai가 해당 URL로 POST |
| 현재 설정 | `https://ai-music-studio-bice.vercel.app/api/callback` |
| 용도 | 폴링 없이 완료 알림 수신 (선택) |

> 현재 앱은 폴링 방식 사용. 콜백은 설정만 되어 있고 수신 처리 미구현.

---

## 10. 앱에서 사용 중인 엔드포인트 요약

| 기능 | 엔드포인트 | 상태 |
|------|-----------|------|
| 음악 생성 | `POST /api/v1/generate` | ✅ 사용 중 |
| 음악 폴링 | `GET /api/v1/generate/record-info` | ✅ 사용 중 |
| 곡 연장 | `POST /api/v1/generate/extend` | ✅ 사용 중 |
| 보컬 변환 | `POST /api/v1/generate/add-vocals` | ✅ 사용 중 |
| 타임스탬프 가사 | `POST /api/v1/generate/get-timestamped-lyrics` | ✅ 사용 중 |
| 가사 생성 | `POST /api/v1/lyrics` | ✅ 사용 중 |
| 가사 폴링 | `GET /api/v1/lyrics/record-info` | ✅ 사용 중 |
| MV 생성 | `POST /api/v1/jobs/createTask` | ✅ 사용 중 |
| MV 폴링 | `GET /api/v1/jobs/recordInfo` | ✅ 사용 중 |
| LLM 채팅 | `POST /gemini-2.5-flash/v1/chat/completions` | ✅ 사용 중 |

---

## 11. 지원

| 채널 | 연락처 |
|------|--------|
| 이메일 | support@kie.ai |
| Discord | 대시보드 하단 메뉴 |
| Telegram | 대시보드 하단 메뉴 |
| 운영 시간 | UTC 21:00~17:00 (다음날) |
