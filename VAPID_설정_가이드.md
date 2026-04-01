# VAPID 키 설정 가이드

## 1. VAPID 키 생성

```bash
# Node.js 설치 후
npx web-push generate-vapid-keys
```

출력 예시:
```
Public Key: BGF...abc (88자)
Private Key: xyz...def (44자)
```

## 2. Vercel 환경변수 설정

Vercel Dashboard → 프로젝트 → Settings → Environment Variables

| 변수명 | 값 |
|--------|-----|
| `VAPID_PUBLIC_KEY` | 위에서 생성한 Public Key |
| `VAPID_PRIVATE_KEY` | 위에서 생성한 Private Key |
| `ADMIN_SECRET` | 관리자 비밀번호 (예: kenny2024!) |

## 3. package.json에 web-push 추가

```json
{
  "type": "module",
  "dependencies": {
    "web-push": "^3.6.7"
  }
}
```

## 4. 배포 후 확인

1. https://ddinggok.com 접속
2. 알림 권한 허용
3. https://ddinggok.com/admin 접속
4. 푸시 알림 탭 → VAPID 상태 확인 → ✅ 표시 확인
5. 로컬 테스트 버튼으로 알림 테스트

## 5. 구독자 수집 방식

현재: 각 사용자의 브라우저 localStorage에 구독 정보 저장
→ 관리자가 앱에서 알림 허용 후 admin에서 자신에게 테스트 가능

실 운영 권장: Vercel KV 또는 Supabase에 구독 정보 중앙 저장
