# Changelog 2026-03-26

## 생성실패 곡 필터링 + A/B 재생 수정 + 공유 UI 통일

### 변경 파일
- `index.html` — 크리에이터뷰 필터, A/B 재생 버튼 수정
- `api/profile.js` — Supabase 쿼리 필터 추가
- `api/tracks.js` — 사용자 곡 조회 필터 추가
- `.claude/commands/qa.md` — QA 기본 점검 항목 3개 추가

---

### 1. 크리에이터뷰 생성실패 곡 미노출

**문제:** 크리에이터 프로필에서 `audio_url`이 없거나 `duration`이 0인 (생성 실패) 곡이 그대로 노출됨

**수정:** `_renderMyFeedDetailView()` 내 `sortedTracks` 생성 시 필터 추가

```javascript
// before
var sortedTracks = d.tracks.slice();

// after
var sortedTracks = d.tracks.filter(function(t) {
  if (!t.audio_url) return false;
  if (t.duration !== undefined && t.duration !== null && Number(t.duration) === 0) return false;
  return true;
}).slice();
```

**영향 범위:** 크리에이터 프로필 상세 뷰 (`_renderMyFeedDetailView`)

---

### 2. DB에서 생성실패 곡 사용자 리스트 제외

**문제:** `profile.js`, `tracks.js`의 Supabase 쿼리가 `audio_url` 빈값/null인 레코드도 반환

**수정:** 두 API 모두 쿼리에 `audio_url=neq.&audio_url=not.is.null` 조건 추가

| 파일 | 엔드포인트 | 변경 |
|------|------------|------|
| `api/profile.js` | `GET /api/profile` | 트랙 조회 쿼리에 audio_url 필터 |
| `api/tracks.js` | `GET /api/tracks?owner=...` | 사용자별 트랙 조회에 audio_url 필터 |

```
# Supabase REST 필터
audio_url=neq.           → 빈 문자열 제외
audio_url=not.is.null    → null 제외
```

**영향 범위:** 크리에이터 프로필 API, 사용자 트랙 목록 API (관리자 조회는 변경 없음)

---

### 3. A/B 레이아웃 재생 버튼 수정

**문제:** 음악 생성 후 A/B 비교 카드의 재생 버튼 클릭 시 재생이 안 됨

**원인 3가지:**

#### 3-1. 이벤트 리스너 중복 바인딩
기존 코드가 `container.querySelectorAll`로 전체 컨테이너에서 버튼을 찾아 이벤트를 바인딩하여, 이전 배치 버튼에 중복 리스너가 쌓임

```javascript
// before — container 전체에서 바인딩 (이전 배치도 포함)
container.querySelectorAll('.ap-play-btn').forEach(...)

// after — 현재 배치(batchWrap)만 스코프
batchWrap.querySelectorAll('.ap-play-btn').forEach(...)
```

총 11곳의 `container.querySelectorAll`을 `batchWrap.querySelectorAll`로 변경 (탭 이벤트 rctab은 container 유지)

#### 3-2. togglePlay idx 충돌
A/B 카드의 `data-idx`가 항상 0, 1이라 여러 배치 간 동일 idx가 존재. `togglePlay`가 idx만 비교하여 다른 배치의 트랙을 같은 트랙으로 오인

```javascript
// before — idx만 비교
if (activeAudio && activeAudio._idx === idx) {

// after — idx + URL 모두 비교
if (activeAudio && activeAudio._idx === idx && activeAudio._url === url) {
```

Audio 객체 생성 시 `_url` 프로퍼티 저장 추가:
```javascript
const audio = new Audio(url);
audio._idx = idx;
audio._url = url;  // 추가
```

#### 3-3. 오디오 전환 팝업 간섭
미니플레이어 재생 중 A/B 카드 재생 시 `showAudioSwitchPopup` 팝업이 뜨며 추가 클릭 필요

```javascript
// A/B 카드 전용 — 다른 오디오 자동 중지 후 바로 재생
batchWrap.querySelectorAll('.ap-play-btn').forEach(btn => btn.addEventListener('click', () => {
  if (getPlayingInfo() && (!activeAudio || activeAudio.paused || activeAudio._url !== btn.dataset.url)) {
    stopAllAudio();
    if (activeAudio) { activeAudio = null; }
  }
  togglePlay(btn);
}));
```

---

### 4. QA 기본 점검 항목 추가

`.claude/commands/qa.md` 기본 항목에 3개 추가:

| # | 항목 | 점검 내용 |
|---|------|-----------|
| 11 | 생성실패 곡 필터링 | 크리에이터뷰에서 audio_url 없거나 duration 0 곡 미노출 |
| 12 | DB 생성실패 곡 제외 | profile.js, tracks.js 쿼리에 audio_url 필터 적용 |
| 13 | A/B 레이아웃 재생 | batchWrap 스코프 이벤트, togglePlay idx+URL 비교, 자동 오디오 중지 |

---

### 5. A/B 생성 실패 트랙 필터링 (전 모드 공통)

**문제:** `pollResult`가 A/B 트랙 중 한쪽이 실패해도 필터링 없이 반환 → 빈 audio_url 카드가 렌더링되어 재생 불가

**원인 분석:**
- `pollResult` (라인 8838): `return tracks` — audio_url 유무 검증 없이 반환
- `renderTracks` (라인 10550): 빈 audioUrl 카드도 그대로 DOM에 추가
- `historyData.unshift` (라인 9807): audio_url 없는 곡도 로컬 히스토리에 저장
- `_saveTrackToServer` (라인 12969): 서버 저장은 가드가 있지만, 로컬 저장은 방어 없음

**수정 (3단계 방어):**

| 단계 | 위치 | 수정 내용 |
|------|------|-----------|
| 1차 필터 | `pollResult` 반환 직후 | `_rawTracks.filter(t => audioUrl 존재)` — 실패 트랙 즉시 제거 |
| 2차 가드 | `historyData.unshift` 직전 | `if(!_tAudioUrl) return` — 이중 방어 |
| 적용 모드 | 커스텀/심플 + 유튜브 | 두 generate 경로 모두 동일 패턴 적용 |

```javascript
// 1차: pollResult 직후
const _rawTracks = await pollResult(apiKey, taskId);
const tracks = _rawTracks.filter(t => (t.audioUrl || t.audio_url || t.song_path || ''));
if (!tracks.length) throw new Error('모든 트랙 생성에 실패했어요');

// 2차: historyData 저장 전
tracks.forEach(t => {
  const _tAudioUrl = t.audioUrl || t.audio_url || t.song_path || '';
  if (!_tAudioUrl) return; // 이중 방어
  // ... historyData.unshift
});
```

---

### 6. 공유 UI/UX 전체모드 통일

**문제:** 공유 UI가 모드별로 분산됨
- A/B 모드: 공유 버튼 자체가 없음 (선택 버튼만 존재)
- 비-A/B 모드: `commShareTrack()` + `_openUnifiedShare()` 별도 버튼
- 전체보기(히스토리): `openShareConfirm()` 모달 (카카오/인스타/페북/링크 + 커뮤니티 토글)

**수정:** 모든 결과 카드(A/B 포함)에서 `openShareConfirm` 통일 모달 사용

| Before | After |
|--------|-------|
| A/B: 공유 버튼 없음 | A/B: "↗ 공유" 버튼 → `openShareConfirm` 모달 |
| 비-A/B: `commShareTrack` + `_openUnifiedShare` | 비-A/B: "↗ 공유" 버튼 → `openShareConfirm` 모달 |
| 인라인 onclick 사용 | `data-rc-open-share` + addEventListener |

```javascript
// 통일된 공유 핸들러
function _rcOpenShare(ti) {
  const tr = tracks[ti]; if (!tr) return;
  let hIdx = historyData.findIndex(h => h.id === tr.id);
  if (hIdx < 0) { historyData.unshift({...}); hIdx = 0; }
  openShareConfirm(hIdx); // 전체모드와 동일한 모달
}
batchWrap.querySelectorAll('[data-rc-open-share]').forEach(btn => {
  btn.addEventListener('click', function() { _rcOpenShare(parseInt(this.dataset.rcOpenShare)); });
});
```

**제거된 코드:**
- `onclick="commShareTrack(...)"` 인라인 호출
- `onclick="_openUnifiedShare(...)"` 인라인 호출
- `!_isAB` 조건 분기 (공유 버튼 숨김 로직)

---

### 테스트 결과

| 테스트 | 결과 |
|--------|------|
| 크리에이터뷰 필터 (audio_url + duration) | ✅ |
| batchWrap 이벤트 리스너 스코프 (11곳) | ✅ |
| togglePlay idx+URL 비교 | ✅ |
| A/B 카드 자동 오디오 중지 | ✅ |
| profile.js DB 필터링 | ✅ |
| tracks.js 사용자 곡 필터링 | ✅ |
| 커스텀 모드 실패 트랙 필터 | ✅ |
| 유튜브 모드 실패 트랙 필터 | ✅ |
| historyData 실패 곡 방어 | ✅ |
| 공유 UI 통일 (A/B + 비-A/B) | ✅ |
| 구 commShareTrack/openUnifiedShare 제거 | ✅ |
| rc-share-row 무조건 렌더링 | ✅ |
