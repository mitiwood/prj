# 관리자 페이지 반응형 레이아웃 (확정)

> 2026-03-24 확정. 이 문서의 레이아웃 구조를 변경하지 말 것.

---

## PC (768px 초과)

| 영역 | 설명 |
|---|---|
| **사이드바 (LNB)** | 좌측 220px 고정, 전체 메뉴 표시 |
| **상단 헤더** | 현재 섹션명 + Admin 배지 |
| **메인 콘텐츠** | 우측 flex:1 영역 |

## 모바일 (768px 이하 / 터치 기기)

| 영역 | 설명 |
|---|---|
| **사이드바** | 숨김 (display:none) |
| **상단 헤더** | 숨김 (mob-header도 숨김) |
| **FAB 버튼** | 좌측 상단 (top:24px, left:12px, 52px 원형, 보라 그라데이션) |
| **드로어 메뉴** | FAB 클릭 시 좌측에서 슬라이드 |
| **메인 콘텐츠** | 전체 너비 사용 |

## 미디어 쿼리 구조

```css
/* 1. CSS 최상단 — 터치 기기 + 좁은 화면 */
@media(pointer:coarse),(hover:none),(max-width:768px){
  .sidebar { display:none!important; }
  .admin-header { display:none!important; }
  .mob-fab { display:flex!important; }
}

/* 2. 반응형 세부 조정 */
@media(max-width:768px){ ... }

/* 3. 초소형 모바일 */
@media(max-width:400px){ ... }
```

## 사이드바 숨김 방식 (5중)

1. `@media(pointer:coarse)` — 터치 기기
2. `@media(hover:none)` — 호버 불가 기기
3. `@media(max-width:768px)` — 좁은 화면
4. `html.is-mobile .sidebar` — JS 클래스 기반
5. JS `DOMContentLoaded` 인라인 `style.cssText` 강제 주입

## FAB 플로팅 버튼

```css
.mob-fab {
  position: fixed;
  top: 24px;
  left: 12px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--acc2), var(--acc));
  font-size: 22px;
  z-index: 90;
}
```

## 캐시 정책

```json
// vercel.json
"headers": [{
  "source": "/admin/(.*)",
  "headers": [{ "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" }]
}]
```

## 주의사항

- **이 레이아웃은 확정 상태이며 수정하지 않는다**
- mob-header는 사용하지 않음 (`display:none!important`)
- PC 사이드바는 절대 건드리지 않는다
