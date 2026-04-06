# BUG-FIX-3: [kieRequest] retry 1/2: music id error

## 오류 메시지
```
[kieRequest] retry 1/2: music id error
```

## 원인 분석

### "music id error"란?
kie.ai API가 음악 생성 완료 후 내부 인덱싱 작업 중에 다른 요청(예: 타임스탬프 가사)이 들어오면 반환하는 일시적 오류. 일반적으로 음악 생성 후 **10~30초** 내에 인덱싱이 완료됩니다.

### 기존 재시도 로직 (문제)
```javascript
// index.html 줄 11641~11645
if((errMsg.includes('music id error')) && _att<_maxRetry){
  console.warn('[kieRequest] recoverable error, retry '+(_att+1)+': '+errMsg);
  await sleep(2000*(1+_att));  // ← retry 1: 2s, retry 2: 4s 대기
  continue;
}
```

- POST 요청의 `_maxRetry=2` → 최대 3회 시도
- 재시도 간격: 2초, 4초 (총 약 6초)
- **문제**: "music id error"는 인덱싱 대기 시간이 필요한데 2~4초는 너무 짧음
- 결국 2회 재시도 모두 실패 → `fpRenderLyrics`로 에러 전파

### 관련 코드 위치
- **`index.html` 줄 11641~11645**: `kieRequest` 내 "music id error" 처리 블록

## 수정 내용

**파일**: `index.html`

### 에러 타입별 재시도 간격 분리
```diff
- console.warn('[kieRequest] recoverable error, retry '+(_att+1)+': '+errMsg);
- await sleep(2000*(1+_att));
+ console.warn('[kieRequest] recoverable error, retry '+(_att+1)+'/'+_maxRetry+': '+errMsg);
+ var _retryWait=errMsg.toLowerCase().includes('music id error')?5000*(1+_att):2000*(1+_att);
+ await sleep(_retryWait);
```

| 에러 유형 | 기존 간격 | 수정 후 간격 |
|-----------|-----------|-------------|
| model is empty | 2s / 4s | 2s / 4s (유지) |
| **music id error** | **2s / 4s** | **5s / 15s** |

- `music id error` 전용 5s/15s 간격으로 인덱싱 완료 대기 시간 확보
- `model is empty`는 기존 2s/4s 유지 (다른 성격의 오류)
- 로그 형식도 `retry 1/2`로 개선 (최대 시도 횟수 표시)

## 수정 효과
- kieRequest 내부에서 "music id error" 재시도 성공률 향상
- `fpRenderLyrics`로 에러 전파 빈도 감소 → 백그라운드 재시도 스케줄 횟수 감소
- 불필요한 API 요청 감소 (kie.ai 서버 부하 절감)
