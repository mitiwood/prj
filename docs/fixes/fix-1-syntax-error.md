# BUG-FIX-1: Uncaught SyntaxError: expected expression, got '<'

## 오류 메시지
```
Uncaught SyntaxError: expected expression, got '<'
```

## 원인 분석

### 주 원인: SPA 캐시 오염 (immutable + HTML 응답 캐시)

Vercel `vercel.json`의 catch-all rewrite:
```json
{ "source": "/:path*", "destination": "/index.html" }
```
이 규칙은 `/js/*.js` 파일에도 적용됩니다. 신규 JS 파일이 아직 배포되지 않은 상태에서 사용자가 접속하면:

1. 브라우저가 `js/auth-manager.js` 요청
2. Vercel이 파일 없음 → catch-all 동작 → `index.html` 반환
3. 브라우저가 `Content-Type: text/html` 응답을 `Cache-Control: public, max-age=31536000, immutable`로 캐시
4. 이후 파일이 배포되어도 `immutable` 캐시 때문에 브라우저가 재요청하지 않음
5. 캐시된 HTML을 JS로 파싱 시도 → `<` 문자에서 SyntaxError

### 영향 파일
- `js/auth-manager.js` (신규)
- `js/follow-manager.js` (신규)
- `js/credit-manager.js` (신규)
- `js/profile-manager.js` (신규)

## 수정 내용

### 1. vercel.json — JS 캐시 정책 변경
**파일**: `vercel.json`

```diff
-  { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
+  { "key": "Cache-Control", "value": "public, max-age=86400, must-revalidate" }
```

- `immutable` 제거: 파일 변경 시 브라우저가 재검증 가능
- `max-age=86400` (1일): 성능 유지하면서 stale 캐시 방지
- `must-revalidate`: 만료 후 반드시 서버 재확인

### 2. index.html — script 태그 cache-busting 버전 추가
**파일**: `index.html` (줄 32839~32848)

```diff
-<script src="js/create-enhance.js"></script>
+<script src="js/create-enhance.js?v=20260406"></script>
```

모든 외부 JS 파일에 `?v=20260406` 쿼리 파라미터 추가:
- 이전에 HTML이 JS로 캐시된 사용자도 새 URL로 올바른 파일을 받음
- URL 변경으로 기존 오염된 캐시 무효화

## 재현 시나리오
1. 신규 JS 파일 없이 배포된 시점에 접속
2. 이후 파일 배포
3. 기존 사용자: 캐시된 HTML을 계속 JS로 사용 → SyntaxError 지속

## 검증
배포 후 DevTools → Network 탭에서 `js/*.js` 요청의 `Content-Type`이 `application/javascript`인지 확인.
