# 📱 모바일에서 GitHub 업로드 + Vercel 자동 배포 방법

## 방법 1. GitHub 웹앱 (가장 쉬움)

1. **Safari / Chrome** 열기
2. `github.com/mitiwood/ai-music-studio` 접속
3. `index.html` 파일 클릭 → 연필 아이콘(✏️) 탭
4. 내용 전체 선택 후 새 코드 붙여넣기
5. 하단 "Commit changes" → **Commit directly to `main`**
6. Vercel이 자동으로 빌드 & 배포 (1~2분)

---

## 방법 2. Working Copy 앱 (추천 — iOS Git 클라이언트)

1. **Working Copy** 앱 설치 (App Store, 무료)
2. 설정 → GitHub 계정 연동
3. Repository → `ai-music-studio` → Clone
4. Files 앱에서 index.html 파일 복사 → Working Copy 폴더에 붙여넣기
5. Working Copy → 변경사항 확인 → **Commit** → **Push**
6. Vercel 자동 배포

---

## 방법 3. Vercel CLI (터미널 앱 사용)

```bash
# iSH 앱 또는 a-Shell 앱 설치 후
npm i -g vercel
vercel login
vercel --prod
```

---

## 방법 4. Vercel 대시보드에서 직접 업로드

1. `vercel.com` 접속 → 로그인
2. 프로젝트 선택 → **Deployments**
3. 우상단 **Deploy** → 파일 직접 드래그 앤 드롭
4. 단, vercel.json + package.json 포함 zip 파일로 업로드 필요

---

## ✅ 권장 워크플로우 (Kenny용)

**수정 → GitHub 웹 편집기 → 자동 배포**

가장 빠른 방법: GitHub 앱 (iOS) 설치
- App Store → "GitHub" 검색 → 설치
- 파일 편집 → 커밋 → Vercel 자동 배포
