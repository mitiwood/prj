# CI/CD 파이프라인 — 웹 + Flutter 자동 동기화

> 최종 업데이트: 2026-03-22

---

## 전체 흐름

```
웹 코드 push (ai-music-studio)
    │
    ├──→ ① Vercel 자동 배포 (웹 업데이트)
    │
    ├──→ ② 텔레그램 + 카카오 배포 알림
    │
    └──→ ③ Flutter 빌드 트리거 (ai-music-studio-flutter)
              │
              ├──→ Android APK + AAB 빌드
              ├──→ iOS IPA 빌드
              │
              └──→ ④ 빌드 완료 시 텔레그램 + 카카오로
                   nightly.link 다운로드 링크 자동 전송
```

---

## 리포지토리

| 리포 | 용도 | URL |
|------|------|-----|
| **ai-music-studio** | 웹앱 (Vercel) | https://github.com/mitiwood/ai-music-studio |
| **ai-music-studio-flutter** | Flutter 앱 (WebView 하이브리드) | https://github.com/mitiwood/ai-music-studio-flutter |

---

## GitHub Actions 워크플로우

### 웹 리포 (ai-music-studio)

| 워크플로우 | 트리거 | 동작 |
|-----------|--------|------|
| `notify-deploy.yml` | main push | Vercel 배포 대기 → 헬스체크 → TG+KK 알림 → Flutter 빌드 트리거 |
| `deploy-healthcheck.yml` | deploy | 배포 후 헬스체크 |
| `e2e-daily.yml` | 매일 | Playwright E2E 테스트 |
| `claude-fix.yml` | PR | 자동 코드 수정 |
| `notify-pr.yml` | PR | PR 알림 |

### Flutter 리포 (ai-music-studio-flutter)

| 워크플로우 | 트리거 | 동작 |
|-----------|--------|------|
| `build.yml` | main push / workflow_dispatch | Android APK+AAB + iOS IPA 빌드 → TG+KK 다운로드 링크 전송 |

---

## 동기화 메커니즘

### 웹 → Flutter 트리거

`notify-deploy.yml` 마지막 단계에서 GitHub API로 Flutter 빌드 트리거:

```yaml
- name: Trigger Flutter build
  run: |
    curl -s -X POST \
      -H "Authorization: token $GH_TOKEN" \
      "https://api.github.com/repos/mitiwood/ai-music-studio-flutter/actions/workflows/build.yml/dispatches" \
      -d '{"ref":"main"}'
```

### Flutter 빌드 완료 알림

`build.yml`의 `notify` job이 Android/iOS 빌드 완료 후 nightly.link 다운로드 URL을 텔레그램+카카오로 동시 전송:

```
📱 Flutter 빌드 완료!

✅ Android APK:
https://nightly.link/mitiwood/ai-music-studio-flutter/actions/runs/{RUN_ID}/android-apk.zip

✅ iOS IPA:
https://nightly.link/mitiwood/ai-music-studio-flutter/actions/runs/{RUN_ID}/ios-ipa.zip
```

---

## Flutter 앱 구조 (WebView 하이브리드)

```
ai-music-studio-flutter/
├── lib/
│   ├── main.dart           # 진입점
│   ├── app.dart            # MaterialApp
│   ├── splash_screen.dart  # 스플래시 (2초 애니메이션)
│   └── webview_screen.dart # WebView (핵심)
├── android/                # Android 설정
├── ios/                    # iOS 설정
└── .github/workflows/
    └── build.yml           # CI/CD
```

### WebView 주요 기능

- **웹앱 100% 로드:** https://ai-music-studio-bice.vercel.app
- **OAuth 도메인 허용:** Google, Kakao, Naver
- **결제 도메인 허용:** api.tosspayments.com
- **외부 링크:** 시스템 브라우저로 분기
- **뒤로가기:** WebView 내부 히스토리 네비게이션
- **오프라인:** 연결 감지 + 재시도 화면
- **PWA 배너 숨김:** CSS 자동 주입
- **JS→Flutter 브릿지:** 공유 기능

---

## 빌드 결과물

| 파일 | 용도 | 크기 |
|------|------|------|
| `app-release.apk` | Android 직접 설치 | ~41MB |
| `app-release.aab` | Play Store 업로드 | ~20MB |
| `KMS-unsigned.ipa` | iOS (unsigned) | ~23MB |

### 다운로드 방법

1. GitHub Actions 빌드 완료 대기
2. 텔레그램/카카오에서 nightly.link 링크 수신
3. 링크 클릭 → zip 다운로드 → 압축 해제 → 설치

---

## 환경변수 / Secrets

### 웹 리포 (Vercel + GitHub)

| 변수 | 위치 | 용도 |
|------|------|------|
| `ADMIN_SECRET` | Vercel env + GitHub Secret | 관리자 인증 |
| `GITHUB_TOKEN` | GitHub 자동 | Flutter 빌드 트리거 |

### Flutter 리포

| 변수 | 위치 | 용도 |
|------|------|------|
| `GITHUB_TOKEN` | GitHub 자동 | Artifact 업로드 |

---

## 스토어 출시 체크리스트

### Android (Play Store)

- [ ] Google Play Console 계정 생성 ($25 일회성)
- [ ] 서명 키 생성 (`keytool`)
- [ ] `build.yml`에 서명 설정 추가
- [ ] AAB 업로드 → 내부 테스트 → 프로덕션

### iOS (App Store)

- [ ] Apple Developer 계정 가입 ($99/년)
- [ ] 인증서 + Provisioning Profile 생성
- [ ] `build.yml`에 코드사인 추가
- [ ] IPA → TestFlight → App Store 심사

---

## 트러블슈팅

### Flutter 빌드 실패 시

1. GitHub Actions 로그 확인
2. `flutter analyze` 에러 확인
3. Gradle/Java 버전 호환 확인 (JDK 17 필수)

### 웹 → Flutter 트리거 실패 시

1. `GITHUB_TOKEN` 권한 확인 (repo scope)
2. Flutter 리포 `build.yml`에 `workflow_dispatch` 존재 확인
3. GitHub Actions 활성화 여부 확인

### 알림 미수신 시

1. Vercel `ADMIN_SECRET` 환경변수 확인
2. 텔레그램 봇 토큰 유효성 확인
3. 카카오 알림 API 상태 확인
