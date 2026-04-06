/**
 * fp-info-actions.js
 * 영역: fp-info-actions (좋아요·공유·더보기 버튼)
 *
 * ── 발견된 버그 ──
 *
 * [BUG-1] 중복 ID — fp-side-actions (display:none) 내부에 동일 ID 6개 존재
 *   위치: index.html:7209-7232
 *   중복 ID 목록:
 *     - fp-like-btn    (원본: 7178 / 중복: 7210)
 *     - fp-like-icon   (원본: 7178 / 중복: 7211)
 *     - fp-dislike-btn (원본: 7202 / 중복: 7213)
 *     - fp-playlist-btn(원본: 7203 / 중복: 7216)
 *     - fp-dl-btn      (원본: 7204 / 중복: 7222)
 *     - fp-del-btn     (원본: 7206 / 중복: 7229)
 *   영향: HTML 스펙 위반, getElementById는 첫 번째 반환이라 현재는 정상 동작하지만
 *         DOM 조작 라이브러리나 querySelectorAll('[id]') 사용 시 오작동.
 *   수정: fp-side-actions 내 중복 id 속성 제거 (HTML 직접 수정 필요)
 *
 * [BUG-2] fp-more-menu 외부 클릭 닫기 없음
 *   위치: index.html:17641-17644
 *   현재 코드:
 *     function _fpToggleMoreMenu(){
 *       var m=$('fp-more-menu'); if(!m) return;
 *       m.style.display = m.style.display==='none' ? 'block' : 'none';
 *     }
 *   증상: 메뉴 열린 상태에서 다른 곳 클릭해도 닫히지 않음.
 *   수정: document 클릭 핸들러 추가 (아래 initFpInfoActions 참고)
 */

/**
 * fp-info-actions 초기화 — 외부 클릭으로 더보기 메뉴 닫기
 * index.html DOMContentLoaded 또는 _doOpenFullPlayer 이후 1회 호출.
 */
function initFpInfoActions() {
  if (window._fpInfoActionsInited) return;
  window._fpInfoActionsInited = true;

  document.addEventListener('click', function(e) {
    var menu = document.getElementById('fp-more-menu');
    var btn  = document.getElementById('fp-more-btn');
    if (!menu || menu.style.display === 'none') return;
    if (btn && (btn === e.target || btn.contains(e.target))) return; // 버튼 클릭은 toggle에서 처리
    if (!menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  }, true); // capture phase — 메뉴 내 버튼 클릭 후 닫힘 방지
}

/**
 * 좋아요 UI 업데이트 — index.html:18440 fpUpdateLikeUI() 동일 로직
 * (참고용, index.html에서 직접 호출)
 */
function _fpUpdateLikeUIRef(fpLiked, fpDisliked) {
  var lb = document.getElementById('fp-like-btn');
  var db = document.getElementById('fp-dislike-btn');
  if (lb) {
    lb.classList.toggle('liked', !!fpLiked);
    var icon = document.getElementById('fp-like-icon');
    if (icon) {
      icon.setAttribute('fill',   fpLiked ? '#ff6482' : 'none');
      icon.setAttribute('stroke', fpLiked ? '#ff6482' : 'currentColor');
    }
  }
  if (db) {
    db.classList.toggle('disliked', !!fpDisliked);
    var dicon = db.querySelector('svg');
    if (dicon) dicon.setAttribute('fill', fpDisliked ? 'currentColor' : 'none');
  }
}
