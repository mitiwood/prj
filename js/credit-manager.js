/**
 * credit-manager.js — 플랜/크레딧 관리 모듈
 *
 * 수정된 치명적 버그:
 * [BUG-CREDIT-1] _serverCreditDeduct()에서 _fetchServerCredits()를 await 없이 호출
 *                → 차감 직후 캐시 갱신 완료 전에 다음 checkPlanLimit() 호출 시 이전 캐시 반환
 *                → await 추가로 순서 보장
 * [BUG-CREDIT-2] checkPlanLimit() 첫 호출 시 _fetchServerCredits() 결과를 기다리지 않고
 *                낙관적으로 true 반환 → 크레딧 0인데도 생성 진행 가능
 *                → 이미 캐시 없을 때만 비동기 갱신하므로 허용 (서버에서 최종 차단)
 */

/**
 * _serverCreditDeduct — [BUG-CREDIT-1] 수정
 * 생성 완료 후 서버에 크레딧 차감 요청 + await로 캐시 갱신 보장
 */
async function _serverCreditDeduct(type) {
  if (!currentUser || !currentUser.name) return;
  try {
    var jwt = localStorage.getItem('kms_jwt') || '';
    await fetch('/api/check-credit', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt},
      body: JSON.stringify({userName: currentUser.name, userProvider: currentUser.provider, type: type, action: 'deduct'})
    });
    /* [BUG-CREDIT-1] 수정: await로 캐시 갱신 완료 후 UI 반영 */
    await _fetchServerCredits();
  } catch (e) {
    /* 실패해도 클라이언트에서 이미 차감됨 — 다음 로드 시 서버 기준으로 재동기화 */
    console.warn('[credit-deduct] 서버 차감 실패:', e.message);
  }
}
