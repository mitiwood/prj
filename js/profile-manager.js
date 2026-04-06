/**
 * profile-manager.js — 프로필 관리 모듈
 *
 * 수정된 치명적 버그:
 * [BUG-PROFILE-1] _editProfile()에서 oldName(25342)과 _prevName(25347) 중복 선언
 *                 → _prevName 제거, oldName으로 통일
 * [BUG-PROFILE-2] 저장 버튼 연타 시 중복 API 호출 가능 (disabled 설정 후 catch에서 미복구)
 *                 → _saving 플래그로 완전 방어
 */

/**
 * _editProfile — [BUG-PROFILE-1, BUG-PROFILE-2] 수정
 */
function _editProfile() {
  if (!currentUser) { openLoginSheet(); return; }
  var bio = currentUser.bio || '';
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;';
  overlay.innerHTML =
    '<div style="width:100%;max-width:var(--sheet-max,480px);background:var(--bg2);border-radius:20px 20px 0 0;padding:20px 16px calc(20px + env(safe-area-inset-bottom));">' +
    '<div style="width:36px;height:4px;background:rgba(255,255,255,.15);border-radius:3px;margin:0 auto 16px;"></div>' +
    '<div style="font-size:17px;font-weight:800;color:var(--t1);margin-bottom:16px;">프로필 편집</div>' +
    '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:var(--t2);display:block;margin-bottom:4px;">닉네임</label>' +
    '<input id="_pf_edit_name" type="text" value="' + (currentUser.name || '').replace(/"/g, '&quot;') + '" maxlength="10" placeholder="최대 10자" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--t1);font-size:14px;font-family:inherit;outline:none;box-sizing:border-box;">' +
    '<div id="_pf_name_warn" style="font-size:11px;color:#ef4444;margin-top:4px;display:none;">닉네임은 최대 10자까지 입력 가능합니다</div>' +
    '<div style="text-align:right;font-size:10px;color:var(--t3);margin-top:2px;"><span id="_pf_name_cnt">' + (currentUser.name || '').length + '</span>/10</div></div>' +
    '<div style="margin-bottom:16px;"><label style="font-size:12px;font-weight:600;color:var(--t2);display:block;margin-bottom:4px;">소개글</label>' +
    '<textarea id="_pf_edit_bio" maxlength="100" rows="2" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--t1);font-size:13px;font-family:inherit;outline:none;resize:none;box-sizing:border-box;">' + (bio || '').replace(/</g, '&lt;') + '</textarea>' +
    '<div style="text-align:right;font-size:10px;color:var(--t3);margin-top:2px;"><span id="_pf_bio_cnt">' + (bio || '').length + '</span>/100</div></div>' +
    '<div style="display:flex;gap:8px;">' +
    '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="flex:1;padding:12px;border-radius:12px;border:1px solid var(--border);background:transparent;color:var(--t2);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">취소</button>' +
    '<button id="_pf_save_btn" style="flex:1;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">저장</button></div></div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  var nameInput = document.getElementById('_pf_edit_name');
  if (nameInput) nameInput.addEventListener('input', function() {
    var len = this.value.length;
    document.getElementById('_pf_name_cnt').textContent = len;
    var warn = document.getElementById('_pf_name_warn');
    if (warn) warn.style.display = len >= 10 ? '' : 'none';
  });
  var bioInput = document.getElementById('_pf_edit_bio');
  if (bioInput) bioInput.addEventListener('input', function() {
    document.getElementById('_pf_bio_cnt').textContent = this.value.length;
  });

  /* [BUG-PROFILE-2] 중복 요청 방어 플래그 */
  var _saving = false;

  document.getElementById('_pf_save_btn').onclick = async function() {
    if (_saving) return; /* 연타 방어 */
    var newName = (document.getElementById('_pf_edit_name') && document.getElementById('_pf_edit_name').value || '').trim();
    var newBio = (document.getElementById('_pf_edit_bio') && document.getElementById('_pf_edit_bio').value || '').trim().slice(0, 100);
    if (!newName) { toast('닉네임을 입력해주세요', 'err'); return; }

    _saving = true;
    this.disabled = true;
    this.textContent = '저장 중...';

    /* [BUG-PROFILE-1] 수정: oldName 단일 변수 사용 (_prevName 제거) */
    var oldName = currentUser.name;
    try {
      var r = await fetch('/api/profile', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'update-profile', name: newName, provider: currentUser.provider, oldName: oldName, email: currentUser.email || '', bio: newBio})
      });
      var d = await r.json();
      if (d.ok) {
        currentUser.name = newName;
        currentUser.bio = newBio;
        window.currentUser = currentUser;
        localStorage.setItem('kms_user', JSON.stringify(currentUser));
        /* 히스토리 owner 이름 즉시 갱신 */
        if (typeof historyData !== 'undefined') {
          historyData.forEach(function(h) {
            if (h._owner && h._owner.name === oldName && h._owner.provider === currentUser.provider) {
              h._owner.name = newName;
            }
          });
          if (typeof saveHistory === 'function') saveHistory();
        }
        /* UI 갱신 */
        if (typeof renderSettings === 'function') renderSettings();
        if (typeof updateLoginUI === 'function') updateLoginUI();
        if (typeof renderHistoryView === 'function') renderHistoryView();
        if (typeof renderCommunity === 'function') renderCommunity();
        if (typeof _syncPlanFromServer === 'function') _syncPlanFromServer();
        toast('프로필이 업데이트되었어요', 'ok', 2000);
        overlay.remove();
      } else {
        toast(d.error || '업데이트 실패', 'err');
        _saving = false;
        this.disabled = false;
        this.textContent = '저장';
      }
    } catch (e) {
      console.warn('[profile-edit]', e);
      toast('업데이트 실패', 'err');
      _saving = false;
      this.disabled = false;
      this.textContent = '저장';
    }
  };
}
