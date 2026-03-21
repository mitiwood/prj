# kie.ai API Reference (공식 문서 기반)

> **출처:** https://docs.kie.ai/
> **마켓:** https://kie.ai/market | **가격:** https://kie.ai/pricing | **키 관리:** https://kie.ai/api-key
> **최종 업데이트:** 2026-03-21

---

## 1. 기본 정보

| 항목 | 내용 |
|------|------|
| Base URL | `https://api.kie.ai` |
| 인증 | `Authorization: Bearer {API_KEY}` |
| Content-Type | `application/json` |
| 크레딧 단가 | $0.005 / 크레딧 (SKU별 5~10% 보너스) |
| Rate Limit | 10초당 20건, 100+ 동시 작업. 초과 시 429 |
| 데이터 보존 | 생성 파일 14일, 로그 2개월 |
| 작업 방식 | 비동기 — task_id 반환 → 폴링 또는 콜백 |
| 지원 | Discord/Telegram (UTC 21:00~17:00), support@kie.ai |

---

## 2. 음악 생성 (Generate Music)

**POST** `/api/v1/generate`

### 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `prompt` | string | ✅ | 가사 또는 설명 (비커스텀: 500자, 커스텀: 3000~5000자) |
| `customMode` | boolean | ✅ | 고급 파라미터 활성화 |
| `instrumental` | boolean | ✅ | true=인스트루멘탈 |
| `model` | string | ✅ | `V4`, `V4_5`, `V4_5PLUS`, `V4_5ALL`, `V5` |
| `callBackUrl` | string | ✅ | 완료 콜백 URL |
| `style` | string | - | 장르/무드 (커스텀모드 필수, 200~1000자) |
| `title` | string | - | 곡 제목 (최대 80자) |
| `negativeTags` | string | - | 제외할 스타일 |
| `vocalGender` | string | - | `m` (남성) / `f` (여성) |
| `styleWeight` | number | - | 스타일 강도 (0~1) |
| `weirdnessConstraint` | number | - | 창의성 (0~1) |
| `audioWeight` | number | - | 오디오 특성 가중치 (0~1) |
| `personaId` | string | - | 페르소나 스타일 ID |

### 요청 예시
```json
{
  "prompt": "A calm and relaxing piano track with soft melodies",
  "customMode": true,
  "instrumental": true,
  "model": "V4_5",
  "callBackUrl": "https://your-domain.com/callback",
  "style": "Classical",
  "title": "Peaceful Piano"
}
```

### 응답
```json
{
  "code": 200,
  "msg": "success",
  "data": { "taskId": "5c79****be8e" }
}
```

### 콜백 응답 (callbackType: text → first → complete)
```json
{
  "code": 200,
  "msg": "All generated successfully",
  "data": {
    "callbackType": "complete",
    "task_id": "2fac****9f72",
    "data": [{
      "id": "e231****8cadc7dc",
      "audio_url": "https://cdn.****.mp3",
      "stream_audio_url": "https://cdn/****",
      "image_url": "https://cdn/****.jpeg",
      "prompt": "[Verse] ...",
      "model_name": "chirp-v4",
      "title": "My Song",
      "tags": "classical, piano",
      "createTime": "2025-01-01 00:00:00",
      "duration": 198.44
    }]
  }
}
```

---

## 3. 가사 생성 (Generate Lyrics)

**POST** `/api/v1/lyrics`

### 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `prompt` | string | ✅ | 가사 주제/분위기 (최대 200자) |
| `callBackUrl` | string | ✅ | **필수!** 없으면 422 |

### 요청 예시
```json
{
  "prompt": "A nostalgic song about childhood memories",
  "callBackUrl": "https://your-domain.com/callback"
}
```

### 응답
```json
{ "code": 200, "msg": "success", "data": { "taskId": "5c79****be8e" } }
```

### 콜백 응답 (2~3개 가사 변형 생성)
```json
{
  "data": [{
    "title": "Yesterday's Dreams",
    "text": "[Verse 1]\nWalking down the old road...\n\n[Chorus]\nThose were the days..."
  }]
}
```

> **주의:** 응답 `data[0].text`에 `\ufffd` 인코딩 아티팩트 가능. 유효성 검사 필요.

---

## 4. 곡 연장 (Extend Music)

**POST** `/api/v1/generate/extend`

### 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `audioId` | string | ✅ | 연장할 트랙 ID |
| `model` | string | ✅ | 모델 (V4, V4_5, V4_5PLUS, V4_5ALL, V5) |
| `callBackUrl` | string | ✅ | 콜백 URL |
| `defaultParamFlag` | boolean | ✅ | true=커스텀 파라미터 사용, false=원곡 설정 상속 |
| `prompt` | string | - | 연장 방향 설명 (3000~5000자) |
| `style` | string | - | 스타일 (200~1000자, defaultParamFlag=true 시) |
| `title` | string | - | 제목 (80~100자) |
| `continueAt` | number | - | 이어붙일 시작 지점 (초) |
| `negativeTags` | string | - | 제외 스타일 |
| `vocalGender` | string | - | `m` / `f` |
| `styleWeight` | number | - | 0~1 |
| `weirdnessConstraint` | number | - | 0~1 |
| `audioWeight` | number | - | 0~1 |
| `personaId` | string | - | 페르소나 ID |

### 요청 예시
```json
{
  "defaultParamFlag": true,
  "audioId": "e231****8cadc7dc",
  "prompt": "Extend with a gentle bridge section",
  "style": "Classical",
  "title": "Peaceful Piano Extended",
  "continueAt": 60,
  "model": "V4_5",
  "callBackUrl": "https://your-domain.com/callback"
}
```

---

## 5. 보컬 추가 (Add Vocals)

**POST** `/api/v1/generate/add-vocals`

### 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `uploadUrl` | string | ✅ | 원본 오디오 URL |
| `prompt` | string | ✅ | 가사/보컬 스타일 설명 |
| `title` | string | ✅ | 곡 제목 |
| `style` | string | ✅ | 장르 |
| `negativeTags` | string | ✅ | 제외 스타일 |
| `callBackUrl` | string | ✅ | 콜백 URL |
| `model` | string | - | `V4_5PLUS` (기본) 또는 `V5` |
| `vocalGender` | string | - | `m` / `f` |
| `styleWeight` | number | - | 0~1 |
| `weirdnessConstraint` | number | - | 0~1 |
| `audioWeight` | number | - | 0~1 |

---

## 6. 타임스탬프 가사 (Timestamped Lyrics)

**POST** `/api/v1/generate/get-timestamped-lyrics`

### 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `taskId` | string | ✅ | 곡 생성 태스크 ID |
| `audioId` | string | ✅ | 트랙 ID |

### 응답
```json
{
  "code": 200,
  "data": {
    "alignedWords": [
      { "word": "Walking", "start": 1.2, "end": 1.8 },
      { "word": "down", "start": 1.8, "end": 2.1 }
    ],
    "waveform": [0.1, 0.3, 0.5, ...],
    "hootCer": 0.95
  }
}
```

> **주의:** instrumental=true로 만든 곡은 가사 데이터 없음.

---

## 7. 작업 상태 조회 (Get Music Details / Polling)

**GET** `/api/v1/generate/record-info?taskId={taskId}`

### 응답
```json
{
  "code": 200,
  "data": {
    "taskId": "abc123",
    "status": "SUCCESS",
    "type": "chirp-v4",
    "operationType": "generate",
    "response": {
      "sunoData": [{
        "id": "track-id",
        "audioUrl": "https://cdn/****.mp3",
        "streamAudioUrl": "https://cdn/****",
        "imageUrl": "https://cdn/****.jpeg",
        "title": "My Song",
        "tags": "pop, dance",
        "duration": 198.44,
        "prompt": "[Verse]..."
      }]
    },
    "errorCode": 0,
    "errorMessage": ""
  }
}
```

### 상태값 (status)

| 상태 | 설명 |
|------|------|
| `PENDING` | 대기 중 |
| `TEXT_SUCCESS` | 가사 생성 완료 |
| `FIRST_SUCCESS` | 첫 번째 트랙 완료 |
| `SUCCESS` | 전체 완료 |
| `CREATE_TASK_FAILED` | 태스크 생성 실패 |
| `GENERATE_AUDIO_FAILED` | 오디오 생성 실패 |
| `CALLBACK_EXCEPTION` | 콜백 오류 |
| `SENSITIVE_WORD_ERROR` | 부적절한 단어 필터링 |

### operationType 값

| 값 | 설명 |
|----|------|
| `generate` | 음악 생성 |
| `extend` | 곡 연장 |
| `upload_cover` | 보컬 추가 |
| `upload_extend` | 업로드 연장 |

---

## 8. 에러 코드

| HTTP | 설명 |
|------|------|
| 200 | 성공 |
| 401 | 인증 실패 (API 키 무효) |
| 402 | 크레딧 부족 |
| 404 | 리소스 없음 |
| 409 | 충돌 (오디오 이미 존재) |
| 422 | 파라미터 검증 실패 |
| 429 | Rate Limit 초과 |
| 451 | 콘텐츠 정책 위반 |
| 455 | 커스텀 에러 |
| 500 | 서버 오류 |

---

## 9. 모델 목록

### 음악 (Suno)

| 모델 | 설명 |
|------|------|
| `V4` | 표준 |
| `V4_5` | 권장 (고품질) |
| `V4_5PLUS` | 최대 8분, 최고 품질 |
| `V4_5ALL` | 전체 기능 |
| `V5` | 최신 |

### 비디오

| 모델 | 설명 |
|------|------|
| Kling (다수 버전) | 텍스트/이미지 → 비디오 |
| Runway | 720P/1080P |
| Veo 3.1 Fast/Quality | Google 비디오 |
| Sora 2 | OpenAI 비디오 |

### 이미지

| 모델 | 설명 |
|------|------|
| Flux Kontext Pro/Max | 이미지 생성 |
| Midjourney | 이미지 생성 |
| DALL-E 4o | 다중 이미지 |
| Ideogram v3 | 텍스트→이미지 |

### LLM (Chat Completion)

| 모델 | 엔드포인트 |
|------|-----------|
| gemini-2.5-flash | `POST /gemini-2.5-flash/v1/chat/completions` |
| GPT-5 | `POST /gpt-5/v1/chat/completions` |
| Claude Sonnet | `POST /claude-sonnet-4-5/v1/chat/completions` |

> **참고:** LLM 지원 모델은 수시 변경. https://kie.ai/market 에서 최신 확인.

---

## 10. 콜백 (Webhook)

| 항목 | 내용 |
|------|------|
| 파라미터 | `callBackUrl` (각 요청에 포함) |
| 단계 | `text` → `first` → `complete` |
| 방식 | 작업 완료 시 kie.ai가 POST |

---

## 11. 폴링 전략 (권장)

```
0~3회:   500ms
4~10회:  1,500ms
11~40회: 2,500ms
41회~:   3,500ms
최대:    60~90회 (약 2~3분)
```

음악 생성: 30~60초 / MV: 1~2분 소요
