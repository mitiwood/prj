# AI Music Studio — 배포 가이드

## 폴더 구조
```
your-repo/
├── ai-music-studio.html   ← 메인 페이지 (index.html로 rename)
└── api/
    └── kie.js             ← Vercel 프록시 (CORS 우회)
```

## 배포 순서

1. `ai-music-studio.html` → `index.html`로 이름 변경
2. GitHub repo에 `index.html` + `api/kie.js` 같이 push
3. Vercel에서 해당 repo 연결 or 기존 repo면 그냥 push

## kie.ai API 키 발급
1. https://kie.ai 가입
2. Dashboard → API Keys → Create Key
3. 앱 우상단 입력창에 붙여넣기

## 작동 원리
브라우저 → /api/kie (Vercel 서버) → api.kie.ai
(CORS는 서버사이드에서만 우회 가능)
