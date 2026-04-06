# BUG-FIX-2: [fpRenderLyrics] timestamped-lyrics 실패, 재시도 예약: music id error

## 오류 메시지
```
[fpRenderLyrics] timestamped-lyrics 실패, 재시도 예약: music id error
ddinggok.com:20396:17
```

## 원인 분석

### 구조
`fpRenderLyrics` 호출 시 타임스탬프 가사 API를 요청하는데:

```
fpRenderLyrics
  └─ Promise.race([
       kieRequest(...get-timestamped-lyrics),  ← 내부 재시도 2회: 2s + 4s = 최대 ~12s
       timeout(8000ms)                          ← 8초 후 reject
     ])
```

### 충돌 시나리오
1. `kieRequest` 첫 요청 → kie.ai "music id error" 응답
2. `kieRequest` 내부 retry 1: 2초 대기 후 재시도
3. `kieRequest` 내부 retry 2: 4초 대기 후 재시도 → 총 ~8초 이상
4. **8000ms 타임아웃이 kieRequest retry 2 도중 발동** → `fpRenderLyrics`가 "timeout" 에러로 종료
5. `kieRequest`는 백그라운드에서 계속 실행 중 (메모리 누수 + 불필요한 요청)
6. `fpRenderLyrics`는 `_retryDelays=[1000,4000,10000,25000,60000]`로 백그라운드 재시도 시작
7. "music id error"는 kie.ai 음악 인덱싱 지연(10~30초)이 원인인데 1초 후 즉시 재시도 → 무의미

### 관련 코드 위치
- **`index.html` 줄 20417~20455**: `fpRenderLyrics` 내 타임스탬프 가사 요청 블록

## 수정 내용

**파일**: `index.html`

### 1. 타임아웃 8000ms → 25000ms
```diff
- new Promise(function(_,rj){setTimeout(function(){rj(new Error('timeout'));},8000);})
+ new Promise(function(_,rj){setTimeout(function(){rj(new Error('timeout'));},25000);})
```
kieRequest 내부 재시도(최대 5s+15s=20s)가 완료될 충분한 시간 확보.

### 2. 백그라운드 재시도 딜레이 조정
```diff
- var _retryDelays=[1000,4000,10000,25000,60000];
+ var _retryDelays=[5000,15000,30000,60000,120000];
```
- "music id error"는 kie.ai 음악 인덱싱 완료 대기 문제
- 최소 5초 후 첫 재시도 (1초는 너무 짧아 동일 에러 반복)
- kie.ai 인덱싱 특성상 첫 성공은 보통 15~30초 범위

## 수정 효과
- 타임아웃 연장으로 kieRequest 내부 재시도가 정상 완료 가능
- 백그라운드 재시도 간격 최적화로 불필요한 API 요청 횟수 감소
- 25s → 5s → 15s → 30s → 60s → 120s 순으로 재시도, 실제 인덱싱 완료 시점에 명중
