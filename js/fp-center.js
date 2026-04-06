/**
 * fp-center.js
 * 영역: fp-center (가사 스크롤 영역)
 *
 * ── 발견된 버그 ──
 *
 * [BUG-1] fp-more-menu가 fp-center와 같은 스크롤 컨테이너(fp-layout) 안에 위치
 *   위치: index.html:7192 — fp-more-menu는 fp-scroll > fp-layout 내부
 *   증상: 스크롤 중 더보기 메뉴 위치가 함께 이동할 수 있음.
 *   현재 상태: fp-more-menu는 display:none으로 숨겨져 있고, 열릴 때 position이
 *              static이라 레이아웃 흐름에 포함됨 — 가사가 많을 때 메뉴가 아래로 밀림.
 *   수정 권장: fp-more-menu를 fp-layout 밖(fp-bottom 위)으로 이동하거나
 *              position:fixed/absolute + z-index 처리.
 *
 * [BUG-2] 가사 없을 때 fp-center 높이 미보장
 *   위치: index.html:3477 .fp-center{flex:1; min-height:0; overflow:hidden}
 *   증상: 가사가 없으면 fp-center가 collapse되어 fp-bottom이 위로 올라옴.
 *   수정 권장: min-height 또는 placeholder 높이 보장.
 *
 * 정상 동작 함수 (index.html 참조):
 *   - fpRenderLyrics(h): 가사 렌더링 (async)
 *   - fpSyncLyrics(currentTime): 재생 시간 → 가사 하이라이트
 *   - _fpAssignTimes(): 가사 균등 분할 타이밍
 *   - _fpStartSyncLoop() / _fpStopSyncLoop(): rAF 루프 제어
 */

/**
 * fp-center min-height CSS 보장 (런타임 패치)
 * index.html에 직접 반영하는 것이 권장되지만 긴급 패치로 사용 가능.
 */
function patchFpCenterMinHeight() {
  var style = document.createElement('style');
  style.textContent = '.fp-center { min-height: 80px; }';
  document.head.appendChild(style);
}
