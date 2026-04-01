# Flutter 앱 가이드

> 최종 업데이트: 2026-03-22

---

## 개요

Kenny's Music Studio Flutter 앱은 **WebView 하이브리드** 방식으로 구현.
기존 웹앱을 WebView로 로드하면서 네이티브 앱 경험을 제공합니다.

- **리포:** https://github.com/mitiwood/ai-music-studio-flutter
- **방식:** Flutter WebView + 기존 Vercel 웹앱
- **장점:** 웹 기능 100% 사용 + 스토어 출시 가능

---

## 기술 스택

| 항목 | 기술 |
|------|------|
| 프레임워크 | Flutter 3.27.4 |
| 언어 | Dart 3.6.2 |
| WebView | webview_flutter 4.10.0 |
| 상태바/UI | Material Design 3 |
| CI/CD | GitHub Actions |
| 빌드 | JDK 17 + Gradle 8.5 + AGP 8.2.0 |

---

## 파일 구조

```
lib/
├── main.dart           # 진입점 (portrait, 상태바 설정)
├── app.dart            # MaterialApp (다크 테마)
├── splash_screen.dart  # 스플래시 화면 (2초, 로고 애니메이션)
└── webview_screen.dart # WebView 핵심 (OAuth, 결제, 오프라인)
```

---

## 주요 기능

### 스플래시 화면
- 로고 fade-in + scale 애니메이션
- 그라디언트 텍스트 (ShaderMask)
- 2초 후 WebView로 전환

### WebView
- **URL:** https://ddinggok.com
- **OAuth 허용 도메인:** accounts.google.com, kauth.kakao.com, nid.naver.com
- **결제 허용:** api.tosspayments.com
- **외부 링크:** 시스템 브라우저로 분기
- **뒤로가기:** WebView 히스토리 네비게이션 (PopScope)
- **오프라인:** connectivity_plus로 감지 → 재시도 화면
- **로딩:** 상단 LinearProgressIndicator
- **PWA 배너 숨김:** JS 주입으로 CSS 삽입
- **JS→Flutter 브릿지:** FlutterBridge 채널 (공유 기능)

---

## 로컬 개발

### 필수 조건
- Flutter SDK 3.27+
- JDK 17
- Android SDK (Android 빌드 시)

### 빌드 명령어

```bash
# 의존성 설치
flutter pub get

# Android APK
export JAVA_HOME="/path/to/jdk17"
flutter build apk --release

# Android AAB (Play Store)
flutter build appbundle --release

# iOS (Mac에서만)
flutter build ios --release --no-codesign
```

---

## CI/CD

웹 리포에 push하면 자동으로 Flutter 빌드가 트리거됩니다.
자세한 내용은 [CI_CD_PIPELINE.md](./CI_CD_PIPELINE.md) 참고.

---

## 향후 계획

| 단계 | 내용 |
|------|------|
| 현재 | WebView 하이브리드 (웹 100% 활용) |
| 다음 | FCM 푸시 알림 네이티브 연동 |
| 이후 | 오프라인 캐싱 (SQLite) |
| 장기 | 네이티브 플레이어, 백그라운드 재생 |
