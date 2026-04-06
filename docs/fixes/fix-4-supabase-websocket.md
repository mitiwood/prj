# BUG-FIX-4: Supabase WebSocket 연결 실패 + __cf_bm 쿠키 거부

## 오류 메시지
```
유효하지 않은 도메인 때문에 "__cf_bm" 쿠키가 거부되었습니다.
Firefox가 wss://efptichfxexjxfatnggm.supabase.co/realtime/v1/websocket?apikey=...
서버에 연결할 수 없습니다.
```

## 원인 분석

### 두 오류의 관계

| 오류 | 원인 | 코드로 해결 가능? |
|------|------|-----------------|
| `__cf_bm` 쿠키 거부 | Firefox Enhanced Tracking Protection이 서드파티 쿠키(`*.supabase.co`) 차단 | 불가 (브라우저 정책) |
| WebSocket 연결 실패 | `__cf_bm` 미설정으로 Cloudflare가 봇으로 판정, 연결 거부 | 간접적으로 완화 가능 |

### 핵심 문제: 무한 재연결

기존 코드에서 Supabase 클라이언트는 기본 지수 백오프로 WebSocket 재연결을 무한 반복:
1. 첫 연결 실패 → 1초 후 재연결
2. 두 번째 실패 → 2초 후 재연결
3. ... 무한 반복 → 콘솔 에러 폭탄 + 불필요한 네트워크 트래픽

기존 subscribe 콜백:
```javascript
.subscribe(function(status){
  _chatRealtimeConnected=(status==='SUBSCRIBED');
  // TIMED_OUT, CHANNEL_ERROR, CLOSED 상태 무시 → 무한 재연결
});
```

### 폴백 현황
채팅은 이미 1초 폴링 폴백이 있어 WebSocket 없이도 정상 동작:
```javascript
_chatPollTimer=setInterval(function(){
  if(_chatRealtimeConnected) return; // WebSocket 연결 시 폴링 스킵
  _loadChatMessages();
},1000);
```

## 수정 내용

**파일**: `index.html` (줄 22580~22650)

### 1. 실패 카운터 추가
```javascript
var _chatWsFailCount=0; // 세션 내 연속 실패 횟수
```

### 2. 2회 이상 실패 시 시도 차단
```javascript
async function _startChatRealtime(){
  if(_chatWsFailCount>=2) return; // 폴링이 대신 처리
  ...
}
```

### 3. createClient 옵션 추가
```javascript
_sbClient=window.supabase.createClient(_sbUrl,_sbAnon,{
  realtime:{
    params:{eventsPerSecond:10},
    reconnectAfterMs:function(tries){
      if(_chatWsFailCount>=2) return 600000; // 사실상 재연결 중단
      return Math.min(tries*3000,15000);     // 3s, 6s, ... max 15s
    },
    timeout:10000 // 10초 내 미연결 시 TIMED_OUT
  }
});
```

### 4. subscribe 상태별 처리
```javascript
.subscribe(function(status){
  if(status==='SUBSCRIBED'){
    _chatRealtimeConnected=true;
    _chatWsFailCount=0; // 성공 시 카운터 리셋
  } else if(status==='TIMED_OUT'||status==='CHANNEL_ERROR'||status==='CLOSED'){
    _chatRealtimeConnected=false;
    _chatWsFailCount++;
    if(_chatWsFailCount>=2){
      // 채널 정리 — 재구독 없음, 폴링이 담당
      _sbClient.removeChannel(_chatRealtimeChannel);
      _chatRealtimeChannel=null;
    }
  }
});
```

## 수정 효과

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| WebSocket 재연결 시도 | 무한 반복 | 최대 2회 후 중단 |
| 콘솔 에러 횟수 | 수십~수백 개 | 최대 2개 |
| 채팅 기능 동작 | WebSocket 실패 시 메시지 지연 가능 | 1초 폴링으로 안정적 동작 |
| `__cf_bm` 쿠키 경고 | 매 재연결마다 출력 | 초기 1~2회만 출력 |

## 참고: __cf_bm 쿠키 경고를 완전히 없애려면
Supabase Dashboard → Settings → Realtime → 도메인 `ddinggok.com` 화이트리스트 등록.
단, Supabase Pro 플랜 이상에서 지원되며 Cloudflare 정책에 따라 제한될 수 있습니다.
