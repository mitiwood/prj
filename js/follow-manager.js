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
 *
 * 고도화:
 * [ENH-1] _pfFollowRollback() 헬퍼 — 롤백 코드 단일화
 * [ENH-2] _onFollowStateChanged() 훅 — 팔로잉 탭 자동 갱신
 * [ENH-3] 모든 토글 함수에 btn.disabled 인플라이트 보호
 * [ENH-4] _toggleFollow 오버라이드 — 프로필 시트 팔로우 완전 교체
 * [ENH-5] _followFeedCache TTL 30초 → 120초
 */

/* ─────────────────────────────────────────────────────────────────────────
   공통 헬퍼
───────────────────────────────────────────────────────────────────────── */

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
 * _pfFollowRollback — [ENH-1] 팔로우 실패 시 캐시·UI 일괄 복원
 * @param {string} fKey        캐시 키 (name__provider)
 * @param {boolean} prevState  이전 팔로우 상태
 * @param {Element|null} btn   복원할 버튼 (선택)
 * @param {string} label       버튼 텍스트 ('팔로우'|'팔로잉')
 */
function _pfFollowRollback(fKey, prevState, btn, label) {
  _followStateCache[fKey] = prevState;
  if (typeof _followPendingOps !== 'undefined') delete _followPendingOps[fKey];
  if (typeof _saveFollowCache === 'function') _saveFollowCache();
  if (btn) {
    btn.disabled = false;
    btn.textContent = label;
  }
}

/**
 * _onFollowStateChanged — [ENH-2] 팔로우/언팔 후 공통 사이드 이펙트
 * 팔로잉 탭이 현재 활성화되어 있으면 강제 리프레시
 */
function _onFollowStateChanged() {
  try {
    var followTab = document.querySelector('.comm-tab[data-tab="following"]');
    if (followTab && followTab.classList.contains('active')) {
      if (typeof _renderFollowingFeed === 'function') _renderFollowingFeed(true);
    }
  } catch (e) { /* 무시 */ }
}

/* ─────────────────────────────────────────────────────────────────────────
   _fetchFollowBatch 오버라이드
   [BUG-FOLLOW-STATE] pending 보호 30초, merge 방식 캐시 갱신
───────────────────────────────────────────────────────────────────────── */
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
          if (serverSet[k]) return;
          if (typeof _followPendingOps !== 'undefined' && _followPendingOps[k] && (now - _followPendingOps[k]) < PENDING_GUARD) return;
          _followStateCache[k] = false;
        });
        /* 서버 팔로우 목록 반영 */
        Object.keys(serverSet).forEach(function(k) { _followStateCache[k] = true; });
        _followBatchLoaded = true;
        _followBatchLoadedAt = Date.now();
        if (typeof _saveFollowCache === 'function') _saveFollowCache();
      }
      return d;
    })
    .catch(function() { return null; })
    .finally(function() { _followBatchPromise = null; });
  return _followBatchPromise;
}

/* ─────────────────────────────────────────────────────────────────────────
   커뮤니티 버튼 일괄 동기화 헬퍼
───────────────────────────────────────────────────────────────────────── */
function _syncCommButtons(name, prov, nowFollowing) {
  document.querySelectorAll(
    '.comm-item-follow-btn[data-cname="' + name + '"][data-cprov="' + prov + '"],' +
    '.comm-creator-follow-btn[data-cname="' + name + '"][data-cprov="' + prov + '"]'
  ).forEach(function(b) {
    if (nowFollowing) { b.textContent = '팔로잉'; b.classList.add('following'); b.dataset.following = '1'; }
    else { b.textContent = '팔로우'; b.classList.remove('following'); b.dataset.following = '0'; }
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   _creatorFollowToggle 오버라이드
   [BUG-FOLLOW-STATE] + [ENH-1][ENH-2][ENH-3]
───────────────────────────────────────────────────────────────────────── */
function _creatorFollowToggle(btn) {
  if (!currentUser) { openLoginSheet(); return; }
  var name = btn.dataset.cname;
  var prov = btn.dataset.cprov;
  if (!name) return;

  /* [ENH-3] 인플라이트 보호 */
  if (btn.disabled) return;

  var isFollowing = btn.dataset.following === '1';
  var nowFollowing = !isFollowing;
  var _fKey = name + '__' + prov;

  /* 자기 자신 팔로우 방지 */
  if (currentUser.name === name && currentUser.provider === prov) {
    toast('자기 자신은 팔로우할 수 없어요', 'err', 2000);
    return;
  }

  /* [ENH-3] 버튼 비활성화 */
  btn.disabled = true;

  /* 즉시 UI 반영 (낙관적) */
  _followStateCache[_fKey] = nowFollowing;
  if (typeof _followPendingOps !== 'undefined') _followPendingOps[_fKey] = Date.now();
  /* TTL 갱신 — 팔로우 직후 _fetchFollowBatch 재호출 방지 */
  _followBatchLoadedAt = Date.now();
  if (typeof _saveFollowCache === 'function') _saveFollowCache();
  if (typeof _followFeedCache !== 'undefined') { _followFeedCache = null; _followFeedAt = 0; }
  if (typeof _followingNames !== 'undefined') _followingNames = null;
  if (typeof _updateCommBadge === 'function') _updateCommBadge();
  if (typeof _myFeedCreators !== 'undefined') _myFeedCreators = null;

  _syncCommButtons(name, prov, nowFollowing);
  toast(nowFollowing ? '팔로우!' : '팔로우 취소', nowFollowing ? 'ok' : '', 1500);

  /* DB 백그라운드 전송 */
  _doFollowRequest(currentUser.name, currentUser.provider, name, prov, nowFollowing).then(function(ok) {
    if (ok) {
      _followStateCache[_fKey] = nowFollowing;
      if (typeof _followPendingOps !== 'undefined') delete _followPendingOps[_fKey];
      if (typeof _saveFollowCache === 'function') _saveFollowCache();
      _syncCommButtons(name, prov, nowFollowing);
      /* [ENH-2] 팔로잉 탭 자동 갱신 */
      _onFollowStateChanged();
      if (typeof _notifyBot === 'function') {
        _notifyBot((nowFollowing ? '\uD83D\uDC65 팔로우' : '\uD83D\uDC64 언팔로우') + '\n\n\uD83D\uDC64 ' + (currentUser && currentUser.name || '익명') + ' \u2192 ' + name);
      }
    } else {
      /* [ENH-1] 롤백 */
      _pfFollowRollback(_fKey, isFollowing, null, '');
      _syncCommButtons(name, prov, isFollowing);
      toast('팔로우 처리 실패', 'err', 1500);
    }
    btn.disabled = false;
  }).catch(function(e) {
    console.warn('[comm-follow]', e);
    _pfFollowRollback(_fKey, isFollowing, null, '');
    _syncCommButtons(name, prov, isFollowing);
    toast('팔로우 처리 실패', 'err', 1500);
    btn.disabled = false;
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   _mfToggleFollow 오버라이드
   [BUG-FOLLOW-1] + [BUG-FOLLOW-STATE] + [ENH-1][ENH-2][ENH-3]
───────────────────────────────────────────────────────────────────────── */
function _mfToggleFollow(btn) {
  if (!currentUser) { openLoginSheet(); return; }
  var name = btn.dataset.name, prov = btn.dataset.provider;

  /* [BUG-FOLLOW-1] 자기 자신 팔로우 방지 */
  if (currentUser.name === name && currentUser.provider === prov) {
    toast('자기 자신은 팔로우할 수 없어요', 'err', 2000);
    return;
  }

  /* [ENH-3] 인플라이트 보호 */
  if (btn.disabled) return;

  var isFollowing = btn.dataset.following === '1';
  var nowFollowing = !isFollowing;
  var fCacheKey = name + '__' + prov;

  /* [ENH-3] 버튼 비활성화 */
  btn.disabled = true;

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
  /* [BUG-FOLLOW-STATE] TTL 갱신 */
  _followBatchLoadedAt = Date.now();
  if (typeof _saveFollowCache === 'function') _saveFollowCache();
  _myFeedCreators = null;
  if (_myFeedDetail && _myFeedDetail.profile) {
    _myFeedDetail.profile.isFollowing = nowFollowing;
    _myFeedDetail.profile.followerCount = (_myFeedDetail.profile.followerCount || 0) + (nowFollowing ? 1 : -1);
  }

  /* 커뮤니티 버튼 동기화 */
  _syncCommButtons(name, prov, nowFollowing);

  /* DB 백그라운드 전송 */
  _doFollowRequest(currentUser.name, currentUser.provider, name, prov, nowFollowing).then(function(ok) {
    if (ok) {
      /* [BUG-FOLLOW-STATE] 서버 확정 후 pendingOps 해제 */
      if (typeof _followPendingOps !== 'undefined') delete _followPendingOps[fCacheKey];
      if (typeof _saveFollowCache === 'function') _saveFollowCache();
      /* [ENH-2] 팔로잉 탭 자동 갱신 */
      _onFollowStateChanged();
    } else {
      /* [ENH-1] 롤백 */
      var prevLabel = isFollowing ? '팔로잉' : '팔로우';
      _pfFollowRollback(fCacheKey, isFollowing, btn, prevLabel);
      if (isFollowing) btn.classList.add('following'); else btn.classList.remove('following');
      btn.dataset.following = isFollowing ? '1' : '0';
      _syncCommButtons(name, prov, isFollowing);
      toast('팔로우 처리 실패', 'err', 1500);
    }
    btn.disabled = false;
  }).catch(function(e) {
    console.warn('[follow]', e);
    var prevLabel = isFollowing ? '팔로잉' : '팔로우';
    _pfFollowRollback(fCacheKey, isFollowing, btn, prevLabel);
    if (isFollowing) btn.classList.add('following'); else btn.classList.remove('following');
    btn.dataset.following = isFollowing ? '1' : '0';
    _syncCommButtons(name, prov, isFollowing);
    toast('팔로우 처리 실패', 'err', 1500);
    btn.disabled = false;
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   _pvToggleFollow 오버라이드
   [BUG-FOLLOW-1] + [BUG-FOLLOW-STATE] + [ENH-1][ENH-2][ENH-3]
───────────────────────────────────────────────────────────────────────── */
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

  /* [ENH-3] 인플라이트 보호 */
  if (btn.disabled) return;

  var isFollowing = btn.dataset.following === '1';
  var nowFollowing = !isFollowing;
  var fCacheKey = tName + '__' + tProv;

  /* [ENH-3] 버튼 비활성화 */
  btn.disabled = true;

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
  if (fc) fc.textContent = Math.max(0, (parseInt(fc.textContent) || 0) + (nowFollowing ? 1 : -1));
  window._pvFollowLock = Date.now();

  /* 글로벌 캐시 동기화 */
  _followStateCache[fCacheKey] = nowFollowing;
  if (typeof _followPendingOps !== 'undefined') _followPendingOps[fCacheKey] = Date.now();
  /* [BUG-FOLLOW-STATE] TTL 갱신 */
  _followBatchLoadedAt = Date.now();
  if (typeof _saveFollowCache === 'function') _saveFollowCache();
  if (typeof _followFeedCache !== 'undefined') { _followFeedCache = null; _followFeedAt = 0; }
  if (typeof _followingNames !== 'undefined') _followingNames = null;
  if (typeof _updateCommBadge === 'function') _updateCommBadge();

  /* 커뮤니티 버튼 동시 갱신 */
  _syncCommButtons(tName, tProv, nowFollowing);

  /* 롤백 함수 */
  var _pvRollback = function() {
    _followStateCache[fCacheKey] = isFollowing;
    if (typeof _followPendingOps !== 'undefined') delete _followPendingOps[fCacheKey];
    if (typeof _saveFollowCache === 'function') _saveFollowCache();
    if (isFollowing) {
      btn.textContent = '팔로잉'; btn.dataset.following = '1';
      btn.style.cssText = 'flex:1;padding:10px;border-radius:10px;background:var(--card);color:var(--t2);border:1px solid var(--border);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;';
    } else {
      btn.textContent = '팔로우'; btn.dataset.following = '0';
      btn.style.cssText = 'flex:1;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;';
    }
    if (fc) fc.textContent = Math.max(0, (parseInt(fc.textContent) || 0) + (isFollowing ? 1 : -1));
    _syncCommButtons(tName, tProv, isFollowing);
    toast('팔로우 처리 실패', 'err', 1500);
  };

  /* DB 백그라운드 전송 */
  _doFollowRequest(currentUser.name, currentUser.provider, tName, tProv, nowFollowing).then(function(ok) {
    if (ok) {
      /* [BUG-FOLLOW-STATE] 서버 확정 후 pendingOps 해제 */
      if (typeof _followPendingOps !== 'undefined') delete _followPendingOps[fCacheKey];
      if (typeof _saveFollowCache === 'function') _saveFollowCache();
      /* [ENH-2] 팔로잉 탭 자동 갱신 */
      _onFollowStateChanged();
    } else {
      _pvRollback();
    }
    btn.disabled = false;
  }).catch(function(e) {
    console.warn('[pv-follow]', e);
    _pvRollback();
    btn.disabled = false;
  });
}
window._pvToggleFollow = _pvToggleFollow;

/* ─────────────────────────────────────────────────────────────────────────
   _toggleFollow 오버라이드 (프로필 시트)
   [ENH-4] 원본에 없는 캐시/pendingOps/커뮤니티 동기화 + 자기 자신 방지 + 인플라이트 보호
───────────────────────────────────────────────────────────────────────── */
function _toggleFollow() {
  if (!currentUser) { openLoginSheet(); return; }
  if (!window._pfTarget) return;
  var tName = window._pfTarget.name, tProv = window._pfTarget.provider;

  /* 자기 자신 팔로우 방지 */
  if (currentUser.name === tName && currentUser.provider === tProv) {
    toast('자기 자신은 팔로우할 수 없어요', 'err', 2000);
    return;
  }

  var btn = document.getElementById('pf-follow-btn');
  if (!btn) return;

  /* [ENH-3] 인플라이트 보호 */
  if (btn.disabled) return;
  btn.disabled = true;

  var isFollowing = btn.dataset.following === '1';
  var nowFollowing = !isFollowing;
  var fKey = tName + '__' + tProv;

  /* 즉시 UI 반영 (낙관적) */
  if (nowFollowing) {
    btn.textContent = '팔로잉'; btn.dataset.following = '1';
    btn.style.background = 'var(--card)'; btn.style.color = 'var(--t2)'; btn.style.border = '1px solid var(--border)';
    toast('팔로우!', 'ok', 1500);
  } else {
    btn.textContent = '팔로우'; btn.dataset.following = '0';
    btn.style.background = 'linear-gradient(135deg,var(--acc),var(--acc2))'; btn.style.color = '#fff'; btn.style.border = 'none';
    toast('팔로우 취소', '', 1500);
  }

  var fc = document.getElementById('pf-followers');
  if (fc) fc.textContent = Math.max(0, parseInt(fc.textContent || '0') + (nowFollowing ? 1 : -1));

  /* 캐시 + pendingOps + TTL 갱신 */
  _followStateCache[fKey] = nowFollowing;
  if (typeof _followPendingOps !== 'undefined') _followPendingOps[fKey] = Date.now();
  _followBatchLoadedAt = Date.now();
  if (typeof _saveFollowCache === 'function') _saveFollowCache();
  if (typeof _followFeedCache !== 'undefined') { _followFeedCache = null; _followFeedAt = 0; }
  if (typeof _followingNames !== 'undefined') _followingNames = null;
  if (typeof _updateCommBadge === 'function') _updateCommBadge();

  /* 커뮤니티 버튼 동기화 */
  _syncCommButtons(tName, tProv, nowFollowing);

  /* DB 백그라운드 전송 */
  _doFollowRequest(currentUser.name, currentUser.provider, tName, tProv, nowFollowing).then(function(ok) {
    if (ok) {
      _followStateCache[fKey] = nowFollowing;
      if (typeof _followPendingOps !== 'undefined') delete _followPendingOps[fKey];
      if (typeof _saveFollowCache === 'function') _saveFollowCache();
      _syncCommButtons(tName, tProv, nowFollowing);
      /* [ENH-2] 팔로잉 탭 자동 갱신 */
      _onFollowStateChanged();
    } else {
      /* 롤백 */
      _followStateCache[fKey] = isFollowing;
      if (typeof _followPendingOps !== 'undefined') delete _followPendingOps[fKey];
      if (typeof _saveFollowCache === 'function') _saveFollowCache();
      if (isFollowing) {
        btn.textContent = '팔로잉'; btn.dataset.following = '1';
        btn.style.background = 'var(--card)'; btn.style.color = 'var(--t2)'; btn.style.border = '1px solid var(--border)';
      } else {
        btn.textContent = '팔로우'; btn.dataset.following = '0';
        btn.style.background = 'linear-gradient(135deg,var(--acc),var(--acc2))'; btn.style.color = '#fff'; btn.style.border = 'none';
      }
      if (fc) fc.textContent = Math.max(0, parseInt(fc.textContent || '0') + (isFollowing ? 1 : -1));
      _syncCommButtons(tName, tProv, isFollowing);
      toast('팔로우 처리 실패', 'err', 1500);
    }
    btn.disabled = false;
  }).catch(function(e) {
    console.warn('[pf-follow]', e);
    _followStateCache[fKey] = isFollowing;
    if (typeof _followPendingOps !== 'undefined') delete _followPendingOps[fKey];
    if (typeof _saveFollowCache === 'function') _saveFollowCache();
    if (isFollowing) {
      btn.textContent = '팔로잉'; btn.dataset.following = '1';
      btn.style.background = 'var(--card)'; btn.style.color = 'var(--t2)'; btn.style.border = '1px solid var(--border)';
    } else {
      btn.textContent = '팔로우'; btn.dataset.following = '0';
      btn.style.background = 'linear-gradient(135deg,var(--acc),var(--acc2))'; btn.style.color = '#fff'; btn.style.border = 'none';
    }
    if (fc) fc.textContent = Math.max(0, parseInt(fc.textContent || '0') + (isFollowing ? 1 : -1));
    _syncCommButtons(tName, tProv, isFollowing);
    toast('팔로우 처리 실패', 'err', 1500);
    btn.disabled = false;
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   _renderFollowingFeed 래퍼 — [ENH-5] TTL 30초 → 120초
   원본 함수를 감싸 _FOLLOW_FEED_TTL 변수를 재정의
───────────────────────────────────────────────────────────────────────── */
(function() {
  /* 원본 함수가 로드된 뒤 실행되도록 DOMContentLoaded 이후에 패치 */
  function _patchFollowFeedTTL() {
    /* _FOLLOW_FEED_TTL 전역 변수가 있으면 120초로 교체 */
    if (typeof window._FOLLOW_FEED_TTL !== 'undefined') {
      window._FOLLOW_FEED_TTL = 120000;
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _patchFollowFeedTTL);
  } else {
    _patchFollowFeedTTL();
  }
})();
