# 사이트맵 (SITEMAP)

> 기준일: 2026-04-06

---

## 1. 페이지 구조

| URL | 파일 | 설명 | 인증 |
|-----|------|------|------|
| `/` | `index.html` | 메인 SPA | 게스트/로그인 |
| `/admin` | `admin/admin.html` | 어드민 대시보드 | 관리자 필수 |
| `/admin/login` | `admin/login.html` | 어드민 로그인 | - |

---

## 2. 메인 앱 뷰 (SPA — index.html)

### create-view (곡 생성)
- 모드: Custom / Simple / MV
- 서브 섹션: 가사 에디터, 프롬프트 미리보기, AI 어시스턴트
- 결과: results-custom / results-simple / results-youtube / results-mv

### history-view (히스토리)
- 탭: 전체 / 내곡 / 음악 / MV / 보컬·MR / 좋아요 / 플리 / MY피드

### community-view (커뮤니티)
- 리더보드, 창작자 카드, 채팅, 공유

### settings-view (설정)
- 테마 / 푸시 알림 / 일일 추천 / 출석 / 내 통계 / 구독 플랜 / 계정

### profile-view (프로필)
- 탭: 곡 / 콜라보 / 팔로워 / 팔로잉
- 알림 필터: 전체 / 좋아요 / 댓글 / 팔로우 / 시스템 / 콜라보

### legal-view (약관)
- 이용약관 / 개인정보처리방침

---

## 3. API 엔드포인트 (76개)

### 인증 (Authentication)
| 엔드포인트 | 설명 |
|-----------|------|
| `GET/POST /api/auth` | 인증 진입점 |
| `GET /api/auth/google` | Google OAuth 시작 |
| `GET /api/auth/google/callback` | Google 콜백 |
| `GET /api/auth/kakao` | Kakao OAuth 시작 |
| `GET /api/auth/kakao/callback` | Kakao 콜백 |
| `GET /api/auth/naver` | Naver OAuth 시작 |
| `GET /api/auth/naver/callback` | Naver 콜백 |
| `GET /api/auth/session-check` | 세션 유효성 확인 |
| `POST /api/auth/token` | 토큰 발급/갱신 |

### 곡 생성 (Generation)
| 엔드포인트 | 설명 |
|-----------|------|
| `POST /api/kie` | KIE API 음악 생성 |
| `POST /api/kie-proxy` | KIE 프록시 (서버 경유) |
| `POST /api/lyria-generate` | AI 가사 생성 |
| `POST /api/analyze` | 곡 분석 |
| `POST /api/yt-analyze` | YouTube 곡 분석 |
| `POST /api/fix-lyrics` | 가사 교정 |

### 트랙 관리 (Tracks)
| 엔드포인트 | 설명 |
|-----------|------|
| `GET/POST/DELETE /api/tracks` | 트랙 CRUD |
| `POST /api/cleanup-tracks` | 만료 트랙 정리 |

### 사용자 (Users)
| 엔드포인트 | 설명 |
|-----------|------|
| `GET/POST /api/users` | 사용자 CRUD (관리자) |
| `GET/POST /api/profile` | 프로필 조회/수정 |
| `GET/POST /api/user-prefs` | 사용자 선호도 |
| `GET/POST /api/managers` | 관리자 권한 |
| `POST /api/attendance` | 출석 체크 |

### 커뮤니티 (Community)
| 엔드포인트 | 설명 |
|-----------|------|
| `GET/POST /api/comments` | 댓글 CRUD |
| `GET/POST /api/collabs` | 콜라보 관리 |
| `GET/POST /api/challenges` | 챌린지 |
| `GET/POST /api/playlist` | 플레이리스트 |
| `GET/POST /api/community-config` | 커뮤니티 설정 |

### 결제 (Payments)
| 엔드포인트 | 설명 |
|-----------|------|
| `POST /api/payments/confirm` | 결제 확인 (Toss) |
| `GET /api/payments/success` | 결제 성공 처리 |
| `POST /api/payments/webhook` | 결제 Webhook |
| `GET /api/toss-config` | 플랜 정의 (SSOT) |
| `POST /api/check-credit` | 크레딧 잔액 확인 |

### 알림/푸시 (Notifications)
| 엔드포인트 | 설명 |
|-----------|------|
| `POST /api/push-subscribe` | 푸시 구독 등록 |
| `POST /api/push-send` | 전체 푸시 발송 |
| `GET /api/push-history` | 푸시 히스토리 |
| `POST /api/live-notify` | 인앱 라이브 알림 |
| `POST /api/notify-manager` | 알림 관리 |
| `POST /api/telegram` | 텔레그램 메시지 전송 |
| `POST /api/kakao-notify` | 카카오 나에게 보내기 |
| `POST /api/kakao-talk` | 카카오톡 |

### 피드/추천 (Feed)
| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/my-feed` | MY 피드 |
| `GET /api/daily-discover` | 오늘의 발견 |
| `GET /api/daily-recommend` | 일일 추천 |

### 공지/설정 (Announcements)
| 엔드포인트 | 설명 |
|-----------|------|
| `GET/POST /api/announcement` | 공지사항 CRUD |
| `GET/POST /api/app-settings` | 앱 전역 설정 |

### Webhook
| 엔드포인트 | 설명 |
|-----------|------|
| `POST /api/tg-webhook` | 텔레그램 봇 수신 |
| `POST /api/kakao-webhook` | 카카오 봇 수신 |
| `POST /api/gh-webhook` | GitHub Actions 수신 |

### 로그/모니터링 (Monitoring)
| 엔드포인트 | 설명 |
|-----------|------|
| `POST /api/logs` | 일반 로그 |
| `POST /api/error-logs` | 에러 로그 |
| `GET /api/reports` | 리포트 생성 |
| `POST /api/sentry-proxy` | Sentry 프록시 |
| `POST /api/sentry-register` | Sentry DSN 등록 |

### 기타 (Misc)
| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/share` | 공유 URL 처리 |
| `GET /api/og-image` | OG 이미지 동적 생성 |
| `GET /api/realtime` | 실시간 접속자 |
| `GET /api/sse-poll` | SSE 폴링 |
| `GET /api/supabase-config` | Supabase 공개 설정 |
| `GET /api/artist-db` | 아티스트 DB 조회 |
| `POST /api/chat` | 채팅 메시지 |
| `POST /api/claude-chat` | Claude AI 채팅 |

---

## 4. 크론 작업 (Cron)

| 스케줄 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `0 * * * *` | `/api/cron/daily-recommend` | 매시간 일일 추천 갱신 |
| `*/30 * * * *` | `/api/cron/status` | 30분마다 상태 확인 |
| `*/10 * * * *` | `/api/sentry-register?action=check` | 10분마다 Sentry 확인 |
| `0 0 * * *` | `/api/cron/healthcheck` | 매일 자정 헬스체크 |

---

## 5. 인증 플로우

```
게스트 → 소셜 로그인 (Google / Kakao / Naver)
       → OAuth 콜백 → JWT 발급 → 세션 저장
       → /?login=ok&provider=...&name=...
```

---

## 6. 외부 연동

| 서비스 | 용도 |
|--------|------|
| **Supabase** | DB, Realtime, Storage |
| **kie.ai** | 음악 생성 API |
| **Toss Payments** | 결제 |
| **Telegram Bot** | 운영 알림 / 봇 명령 |
| **Kakao** | OAuth, 알림, 공유 |
| **Naver** | OAuth |
| **GitHub Actions** | CI/CD |
| **Sentry** | 에러 모니터링 |
| **Vercel** | 호스팅 / 서버리스 |
