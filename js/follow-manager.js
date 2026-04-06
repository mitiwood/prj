/**
 * follow-manager.js — 팔로우 관리 모듈
 *
 * 수정된 치명적 버그:
 * [BUG-FOLLOW-1] _mfToggleFollow / _pvToggleFollow — 자기 자신 팔로우 가능
 *                → currentUser와 대상이 동일하면 차단
 * [BUG-FOLLOW-2] 팔로우 롤백 로직이 _mfToggleFollow / _pvToggleFollow 양쪽에 중복
 *                → _doFollowRequest() 공통 함수로 추출
 * [BUG-FOLLOW-STATE] _fetchFollowBatch pending 보호 윈도우 5초 → 30초
 *                    + 팔로우 액션 후 _followBatchLoadedAt TTL 갱신 누락
 *                    + 서버 확정 후 캐시 재확인 누락
 *                    → 커뮤니티 재렌더링 시 팔로우 상태 초기화 버그 수정
 */

/**
 * _doFollowRequest — 팔로우/언팔로우 API 호출 공통 함수
 * 성공 시 true, 실패 시 false 반환 (Promise)
 */
function _doFollowRequest(followerName, followerProvider, followingName, followingProvider, nowFollowing) {
  return fetch('/api/profile', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      action: nowFollowing ? 'follow' : 'unfollow',
      followerName: followerName,
      followerProvider: followerProvider,
      followingName: followingName,
      followingProvider: followingProvider,
    })
  }).then(function(r) { return r.json(); }).then(function(d) { return !!d.ok; });
}

/**
 * _mfToggleFollow — 마이피드 크리에이터 팔로우 토글
 * [BUG-FOLLOW-1] 수정: 자기 자신 팔로우 차단
 */
function _mfToggleFollow(btn) {
  if (!currentUser) { openLoginSheet(); return; }
  var name = btn.dataset.name, prov = btn.dataset.provider;

  /* [BUG-FOLLOW-1] 자기 자신 팔로우 방지 */
  if (currentUser.name === name && currentUser.provider === prov) {
    toast('자기 자신은 팔로우할 수 없어요', 'err', 2000);
    return;
  }

  var isFollowing = btn.dataset.following === '1';
  var nowFollowing = !isFollowing;
  var fCacheKey = name + '__' + prov;

  /* 즉시 UI 반영 (낙관적) */
  if (nowFollowing) {
    btn.textContent = '팔로잉'; btn.dataset.following = '1'; btn.classList.add('following');
    toast('팔로우!', 'ok', 1500);
    if (typeof _mfConfetti === 'function') _mfConfetti(btn);
  } else {
    btn.textContent = '팔로우'; btn.dataset.following = '0'; btn.classList.remove('following');
    toast('팔로우 취소', '', 1500);
  }

  _followStateCache[fCacheKey] = nowFollowing;
  if (typeof _followPendingOps !== 'undefined') _followPendingOps[fCacheKey] = Date.now();
  if (typeof _saveFollowCache === 'function') _saveFollowCache();
  _myFeedCreators = null;
  if (_myFeedDetail && _myFeedDetail.profile) {
    _myFeedDetail.profile.isFollowing = nowFollowing;
    _myFeedDetail.profile.followerCount = (_myFeedDetail.profile.followerCount || 0) + (nowFollowing ? 1 : -1);
  }

  /* DB 백그라운드 전송 */
  _doFollowRequest(currentUser.name, currentUser.provider, name, prov, nowFollowing).then(function(ok) {
    if (!ok) {
      /* 실패 시 롤백 */
      _followStateCache[fCacheKey] = isFollowing;
      if (typeof _saveFollowCache === 'function') _saveFollowCache();
      if (isFollowing) { btn.textContent = '팔로잉'; btn.dataset.following = '1'; btn.classList.add('following'); }
      else { btn.textContent = '팔로우'; btn.dataset.following = '0'; btn.classList.remove('following'); }
      toast('팔로우 처리 실패', 'err', 1500);
    }
  }).catch(function(e) {
    console.warn('[follow]', e);
    _followStateCache[fCacheKey] = isFollowing;
    if (typeof _saveFollowCache === 'function') _saveFollowCache();
    if (isFollowing) { btn.textContent = '팔로잉'; btn.dataset.following = '1'; btn.classList.add('following'); }
    else { btn.textContent = '팔로우'; btn.dataset.following = '0'; btn.classList.remove('following'); }
    toast('팔로우 처리 실패', 'err', 1500);
  });
}

/**
 * _pvToggleFollow — 프로필뷰 팔로우 토글
 * [BUG-FOLLOW-1] 수정: 자기 자신 팔로우 차단
 */
function _pvToggleFollow() {
  if (!currentUser) { openLoginSheet(); return; }
  if (!window._pvTarget) return;
  var tName = window._pvTarget.name, tProv = window._pvTarget.provider;

  /* [BUG-FOLLOW-1] 자기 자신 팔로우 방지 */
  if (currentUser.name === tName && currentUser.provider === tProv) {
    toast('자기 자신은 팔로우할 수 없어요', 'err', 2000);
    return;
  }

  var btn = document.getElementById('pv-follow-btn');
  if (!btn) return;
  var isFollowing = btn.dataset.following === '1';
  var nowFollowing = !isFollowing;
  var fCacheKey = tName + '__' + tProv;

  /* 즉시 UI 반영 (낙관적) */
  if (nowFollowing) {
    btn.textContent = '팔로잉'; btn.dataset.following = '1';
    btn.style.cssText = 'flex:1;padding:10px;border-radius:10px;background:var(--card);color:var(--t2);border:1px solid var(--border);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;';
    window._pvFollowState = true;
    toast('팔로우!', 'ok', 1500);
  } else {
    btn.textContent = '팔로우'; btn.dataset.following = '0';
    btn.style.cssText = 'flex:1;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;';
    window._pvFollowState = false;
    toast('팔로우 취소', '', 1500);
  }

  var fc = document.getElementById('pv-follower-cnt');
  if (fc) { fc.textContent = Math.max(0, (parseInt(fc.textContent) || 0) + (nowFollowing ? 1 : -1)); }
  window._pvFollowLock = Date.now();

  /* 글로벌 캐시 동기화 */
  _followStateCache[fCacheKey] = nowFollowing;
  if (typeof _followPendingOps !== 'undefined') _followPendingOps[fCacheKey] = Date.now();
  if (typeof _saveFollowCache === 'function') _saveFollowCache();
  if (typeof _followFeedCache !== 'undefined') { _followFeedCache = null; _followFeedAt = 0; }
  if (typeof _followingNames !== 'undefined') _followingNames = null;
  if (typeof _updateCommBadge === 'function') _updateCommBadge();

  /* 커뮤니티 버튼 동시 갱신 */
  document.querySelectorAll('.comm-item-follow-btn[data-cname="' + tName + '"][data-cprov="' + tProv + '"],.comm-creator-follow-btn[data-cname="' + tName + '"][data-cprov="' + tProv + '"]').forEach(function(b) {
    if (nowFollowing) { b.textContent = '팔로잉'; b.classList.add('following'); b.dataset.following = '1'; }
    else { b.textContent = '팔로우'; b.classList.remove('following'); b.dataset.following = '0'; }
  });

  /* 롤백 함수 */
  var _pvRollback = function() {
    _followStateCache[fCacheKey] = isFollowing;
    if (typeof _saveFollowCache === 'function') _saveFollowCache();
    if (isFollowing) {
      btn.textContent = '팔로잉'; btn.dataset.following = '1';
      btn.style.cssText = 'flex:1;padding:10px;border-radius:10px;background:var(--card);color:var(--t2);border:1px solid var(--border);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;';
    } else {
      btn.textContent = '팔로우'; btn.dataset.following = '0';
      btn.style.cssText = 'flex:1;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;';
    }
    if (fc) fc.textContent = Math.max(0, (parseInt(fc.textContent) || 0) + (isFollowing ? 1 : -1));
    toast('팔로우 처리 실패', 'err', 1500);
  };

  /* DB 백그라운드 전송 */
  _doFollowRequest(currentUser.name, currentUser.provider, tName, tProv, nowFollowing).then(function(ok) {
    if (!ok) _pvRollback();
  }).catch(function(e) { console.warn('[pv-follow]', e); _pvRollback(); });
}
window._pvToggleFollow = _pvToggleFollow;

/**
 * _fetchFollowBatch — [BUG-FOLLOW-STATE] 수정
 * pending 보호 윈도우 5초 → 30초
 * 캐시 초기화 방식: 전체 reset → 서버 데이터 기준 merge (pending 보호 항목 유지)
 */
function _fetchFollowBatch() {
  if (!currentUser) return Promise.resolve(null);
  if (_followBatchLoaded && (Date.now() - _followBatchLoadedAt) < _FOLLOW_CACHE_TTL) return Promise.resolve(null);
  if (_followBatchPromise) return _followBatchPromise;
  _followBatchPromise = fetch('/api/profile?name=_&provider=_&action=batch-follow-check&viewerName=' + encodeURIComponent(currentUser.name) + '&viewerProvider=' + encodeURIComponent(currentUser.provider))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.ok && d.followingSet) {
        var now = Date.now();
        var PENDING_GUARD = 30000; /* 30초 — 5초에서 연장 */
        var serverSet = d.followingSet;
        /* 서버에 없는 항목만 false — pending 보호 내 항목은 클라이언트 값 유지 */
        Object.keys(_followStateCache).forEach(function(k) {
          if (serverSet[k]) return; /* 서버에 있으면 유지 */
          if (_followPendingOps[k] && (now - _followPendingOps[k]) < PENDING_GUARD) return; /* pending 보호 */
          _followStateCache[k] = false;
        });
        /* 서버 팔로우 목록 반영 */
        Object.keys(serverSet).forEach(function(k) { _followStateCache[k] = true; });
        _followBatchLoaded = true;
        _followBatchLoadedAt = Date.now();
        _saveFollowCache();
      }
      return d;
    })
    .catch(function() { return null; })
    .finally(function() { _followBatchPromise = null; });
  return _followBatchPromise;
}

/**
 * _creatorFollowToggle — [BUG-FOLLOW-STATE] 수정
 * 1) 팔로우 액션 시 _followBatchLoadedAt TTL 갱신
 * 2) 서버 확정 후 캐시 재확인 + pendingOps 해제
 */
function _creatorFollowToggle(btn) {
  if (!currentUser) { openLoginSheet(); return; }
  var name = btn.dataset.cname;
  var prov = btn.dataset.cprov;
  if (!name) return;
  var isFollowing = btn.dataset.following === '1';
  var nowFollowing = !isFollowing;
  var _fKey = name + '__' + prov;

  /* 자기 자신 팔로우 방지 */
  if (currentUser.name === name && currentUser.provider === prov) {
    toast('자기 자신은 팔로우할 수 없어요', 'err', 2000);
    return;
  }

  /* 즉시 UI 반영 (낙관적) */
  _followStateCache[_fKey] = nowFollowing;
  if (typeof _followPendingOps !== 'undefined') _followPendingOps[_fKey] = Date.now();
  /* [BUG-FOLLOW-STATE] TTL 갱신 — 팔로우 직후 _fetchFollowBatch 재호출 방지 */
  _followBatchLoadedAt = Date.now();
  _saveFollowCache();
  if (typeof _followFeedCache !== 'undefined') { _followFeedCache = null; _followFeedAt = 0; }
  if (typeof _followingNames !== 'undefined') _followingNames = null;
  if (typeof _updateCommBadge === 'function') _updateCommBadge();
  if (typeof _myFeedCreators !== 'undefined') _myFeedCreators = null;

  document.querySelectorAll('.comm-item-follow-btn[data-cname="' + name + '"][data-cprov="' + prov + '"],.comm-creator-follow-btn[data-cname="' + name + '"][data-cprov="' + prov + '"]').forEach(function(b) {
    if (nowFollowing) { b.textContent = '팔로잉'; b.classList.add('following'); b.dataset.following = '1'; }
    else { b.textContent = '팔로우'; b.classList.remove('following'); b.dataset.following = '0'; }
  });
  toast(nowFollowing ? '팔로우!' : '팔로우 취소', nowFollowing ? 'ok' : '', 1500);

  /* DB 백그라운드 전송 */
  fetch('/api/profile', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      action: nowFollowing ? 'follow' : 'unfollow',
      followerName: currentUser.name, followerProvider: currentUser.provider,
      followingName: name, followingProvider: prov,
    })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.ok) {
      /* [BUG-FOLLOW-STATE] 서버 확정 후 캐시 재확인 + pendingOps 해제 */
      _followStateCache[_fKey] = nowFollowing;
      if (typeof _followPendingOps !== 'undefined') delete _followPendingOps[_fKey];
      _saveFollowCache();
      document.querySelectorAll('.comm-item-follow-btn[data-cname="' + name + '"][data-cprov="' + prov + '"],.comm-creator-follow-btn[data-cname="' + name + '"][data-cprov="' + prov + '"]').forEach(function(b) {
        if (nowFollowing) { b.textContent = '팔로잉'; b.classList.add('following'); b.dataset.following = '1'; }
        else { b.textContent = '팔로우'; b.classList.remove('following'); b.dataset.following = '0'; }
      });
      if (typeof _notifyBot === 'function') _notifyBot((nowFollowing ? '\uD83D\uDC65 \uD314\uB85C\uC6B0' : '\uD83D\uDC64 \uC5B8\uD314\uB85C\uC6B0') + '\n\n\uD83D\uDC64 ' + (currentUser && currentUser.name || '\uC775\uBA85') + ' \u2192 ' + name);
    } else {
      /* 롤백 */
      _followStateCache[_fKey] = isFollowing;
      if (typeof _followPendingOps !== 'undefined') delete _followPendingOps[_fKey];
      _saveFollowCache();
      document.querySelectorAll('.comm-item-follow-btn[data-cname="' + name + '"][data-cprov="' + prov + '"],.comm-creator-follow-btn[data-cname="' + name + '"][data-cprov="' + prov + '"]').forEach(function(b) {
        if (isFollowing) { b.textContent = '팔로잉'; b.classList.add('following'); b.dataset.following = '1'; }
        else { b.textContent = '팔로우'; b.classList.remove('following'); b.dataset.following = '0'; }
      });
      toast('팔로우 처리 실패', 'err', 1500);
    }
  }).catch(function(e) {
    console.warn('[comm-follow]', e);
    _followStateCache[_fKey] = isFollowing;
    if (typeof _followPendingOps !== 'undefined') delete _followPendingOps[_fKey];
    _saveFollowCache();
    document.querySelectorAll('.comm-item-follow-btn[data-cname="' + name + '"][data-cprov="' + prov + '"],.comm-creator-follow-btn[data-cname="' + name + '"][data-cprov="' + prov + '"]').forEach(function(b) {
      if (isFollowing) { b.textContent = '팔로잉'; b.classList.add('following'); b.dataset.following = '1'; }
      else { b.textContent = '팔로우'; b.classList.remove('following'); b.dataset.following = '0'; }
    });
    toast('팔로우 처리 실패', 'err', 1500);
  });
}
