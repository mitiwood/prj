/**
 * auth-manager.js — 로그인/로그아웃 관리 모듈
 *
 * 수정된 치명적 버그:
 * [BUG-AUTH-1] logout()에서 localStorage.clear()가 테마·음악설정 등 모든 데이터 삭제
 *              → 인증 관련 키만 선택적으로 삭제하도록 수정
 */

/* 로그아웃 시 삭제할 인증 관련 키 목록 */
var _AUTH_STORAGE_KEYS = [
  'kms_user', 'kms_jwt', 'kms_session_id',
  'kms_plan', 'kms_credits',
  'kms_follow_cache', 'kms_follow_pending',
  'kms_guest_mode', 'kms_guest_songs', 'kms_guest_id',
  'kms_server_credits_cache',
];

/* 월별 사용량 키 패턴 (kms_usage_YYYYMM) */
function _clearUsageKeys() {
  var toDelete = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && (k.startsWith('kms_usage_') || k.startsWith('kms_credit_hist'))) {
      toDelete.push(k);
    }
  }
  toDelete.forEach(function(k) { localStorage.removeItem(k); });
}

/**
 * logout — [BUG-AUTH-1] 수정
 * localStorage.clear() → 인증 키만 선택 삭제 (테마·음악설정 유지)
 */
function logout() {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:flex-end;justify-content:center;';
  overlay.innerHTML = `<div style="width:100%;max-width:var(--sheet-max,480px);background:var(--card,#1e1e2a);border-radius:20px 20px 0 0;padding:28px 20px 36px;border-top:1px solid rgba(255,255,255,.1);">
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:18px;font-weight:800;color:#f1f0f5;margin-bottom:6px;">로그아웃</div>
      <div style="font-size:13px;color:#a09ab8;">정말 로그아웃 하시겠습니까?</div>
    </div>
    <div style="display:flex;gap:10px;">
      <button id="_logout_cancel" style="flex:1;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:#a09ab8;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">취소</button>
      <button id="_logout_confirm" style="flex:1;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">로그아웃</button>
    </div></div>`;
  document.body.appendChild(overlay);
  document.getElementById('_logout_cancel').onclick = function() { overlay.remove(); };
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.getElementById('_logout_confirm').onclick = function() {
    overlay.remove();

    /* 봇 알림 */
    if (typeof _notifyBot === 'function') {
      _notifyBot('\uD83D\uDD12 \uB85C\uADF8\uC544\uC6C3\n\n\uD83D\uDC64 ' + (currentUser && currentUser.name || '\uC775\uBA85') + '\n\uD83D\uDD17 ' + (currentUser && currentUser.provider || '') + '\n\u23F0 ' + new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}));
    }

    /* 서버에 로그아웃 상태 전달 */
    if (currentUser && currentUser.name) {
      var _logoutPayload = JSON.stringify({name: currentUser.name, provider: currentUser.provider || '', lastLogin: 1});
      try {
        navigator.sendBeacon('/api/users', new Blob([_logoutPayload], {type: 'application/json'}));
      } catch (e) {
        fetch('/api/users', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: _logoutPayload, keepalive: true}).catch(function() {});
      }
    }

    /* 유저 상태 초기화 */
    currentUser = null;
    historyData = [];
    if (typeof _sbTracks !== 'undefined') { _sbTracks = []; _sbLoaded = false; _sbLoadedAt = 0; }
    if (typeof _sbMyTracks !== 'undefined') { _sbMyTracks = []; _sbMyLoaded = false; }

    /* 관리자 전용 섹션 숨김 */
    var _as = document.getElementById('account-section'); if (_as) _as.style.display = 'none';
    var _ds = document.getElementById('data-section'); if (_ds) _ds.style.display = 'none';

    /* [BUG-AUTH-1] 수정: 인증 관련 키만 선택 삭제 (테마·음악설정 등 보존) */
    _AUTH_STORAGE_KEYS.forEach(function(k) { localStorage.removeItem(k); });
    _clearUsageKeys();
    sessionStorage.clear();

    /* 쿠키 전부 삭제 */
    document.cookie.split(';').forEach(function(c) {
      document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date(0).toUTCString() + ';path=/');
    });

    /* SW 구독 해제 */
    try {
      navigator.serviceWorker && navigator.serviceWorker.getRegistration('/sw.js').then(function(reg) {
        reg && reg.pushManager && reg.pushManager.getSubscription().then(function(sub) { sub && sub.unsubscribe(); });
      });
    } catch (e) {}

    /* 캐시 스토리지 삭제 */
    try { caches && caches.keys().then(function(ks) { ks.forEach(function(k) { caches.delete(k); }); }); } catch (e) {}

    /* 완료 팝업 */
    _showLogoutDonePopup();
  };
}
