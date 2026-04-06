/**
 * fp-bottom.js
 * 영역: fp-bottom (진행바 + 재생 컨트롤)
 *
 * ── 발견된 버그 ──
 *
 * [BUG-1] closeFullPlayer() 로직 오류 — 미니플레이어 show 후 즉시 hide
 *   위치: index.html:17956-17961
 *   현재 코드 (버그):
 *     function closeFullPlayer(){
 *       const _mp=$('mini-player');
 *       if(_mp){ _mp.classList.remove('mp-hide'); _mp.style.transition=''; }
 *       hideMiniPlayer(); // ← 방금 show한 것을 바로 hide
 *     }
 *   증상: 함수 호출 시 미니플레이어가 보였다가 즉시 사라짐.
 *         게다가 이 함수는 어디서도 호출되지 않음(fp-back 버튼은 자체 핸들러 사용).
 *   수정: fp-back 버튼 핸들러(index.html:17963)와 동일한 로직으로 교체
 *         + fp-back에서 이 함수를 호출하도록 통합.
 *
 * [BUG-2] fp-prog-wrap 터치 이벤트 없음 — 모바일 스크럽 불가 (치명적)
 *   위치: index.html:17952-17956
 *   현재 코드:
 *     $('fp-prog-wrap').onclick = e => {
 *       if(!fpAudio?.duration) return;
 *       const r = $('fp-prog-wrap').getBoundingClientRect();
 *       fpAudio.currentTime = fpAudio.duration * Math.max(0, Math.min(1, (e.clientX-r.left)/r.width));
 *     };
 *   증상: 모바일에서 진행바 터치해도 재생 위치 이동 안 됨.
 *   수정: touchstart/touchmove/touchend 핸들러 추가 (아래 initFpProgTouch 참고)
 *
 * [BUG-3] 진행바 초기화 중복 (경미)
 *   위치: index.html:17764-17767 (1차), 17804-17808 (2차)
 *   증상: _doOpenFullPlayer() 내에서 동일 코드 2회 실행 — 기능 영향 없음.
 *   수정 권장: 2차(17804-17808) 삭제로 정리.
 */

/**
 * [FIX-BUG-1] closeFullPlayer 수정 버전
 * index.html:17956의 closeFullPlayer 함수를 이 코드로 교체.
 */
function closeFullPlayer() {
  var fp = document.getElementById('fullplayer');
  if (fp) fp.classList.remove('on');
  document.body.style.overflow = '';

  if (typeof fpStopViz === 'function') fpStopViz();
  if (typeof _stopSpectrum === 'function') _stopSpectrum();

  /* 재생 중인 곡이 있을 때만 미니플레이어 복원 */
  var fpIdx = typeof fpCurrentIdx !== 'undefined' ? fpCurrentIdx : -1;
  if (fpIdx >= 0 && typeof historyData !== 'undefined' && historyData[fpIdx]?.audio_url) {
    var mp = document.getElementById('mini-player');
    if (mp) {
      mp.classList.remove('mp-hide');
      mp.style.transition = '';
      mp.classList.add('on');
      document.body.classList.add('mp-on');
    }
  }

  /* 재생 중이면 미니플레이어 비주얼라이저 시작 */
  if (typeof fpAudio !== 'undefined' && fpAudio && !fpAudio.paused) {
    if (typeof mpStartViz === 'function') mpStartViz();
    var mpBtn = document.getElementById('mp-play-btn');
    if (typeof _setPlayIcon === 'function') _setPlayIcon(mpBtn, true, false);
  }
}

/**
 * [FIX-BUG-2] fp-prog-wrap 터치 지원 초기화
 * _doOpenFullPlayer() 내 시크 설정 코드 이후에 호출.
 * 또는 DOMContentLoaded 후 1회 호출해도 됨(onclick과 달리 addEventListener는 중복 등록 방지 가능).
 */
function initFpProgTouch() {
  var pw = document.getElementById('fp-prog-wrap');
  if (!pw || pw._fpTouchInited) return;
  pw._fpTouchInited = true;

  var _seeking = false;

  function _calcPos(e) {
    var touch = e.touches && e.touches[0] ? e.touches[0] : e.changedTouches && e.changedTouches[0];
    if (!touch) return null;
    var r = pw.getBoundingClientRect();
    return Math.max(0, Math.min(1, (touch.clientX - r.left) / r.width));
  }

  pw.addEventListener('touchstart', function(e) {
    var pos = _calcPos(e);
    if (pos === null) return;
    var audio = typeof fpAudio !== 'undefined' ? fpAudio : null;
    if (!audio || !audio.duration) return;
    _seeking = true;
    audio.currentTime = audio.duration * pos;
    e.preventDefault(); // 스크롤 방지
  }, { passive: false });

  pw.addEventListener('touchmove', function(e) {
    if (!_seeking) return;
    var pos = _calcPos(e);
    if (pos === null) return;
    var audio = typeof fpAudio !== 'undefined' ? fpAudio : null;
    if (!audio || !audio.duration) return;
    audio.currentTime = audio.duration * pos;
    e.preventDefault();
  }, { passive: false });

  pw.addEventListener('touchend', function() {
    _seeking = false;
  });

  pw.addEventListener('touchcancel', function() {
    _seeking = false;
  });
}
