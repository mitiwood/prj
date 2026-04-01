/**
 * model-profiles.js — AI 모델 프로필 + 추천 시스템
 */

/* ── 모델 프로필 정의 ── */
var MODEL_PROFILES = {
  V3_5: {
    name: 'V3.5', speed: 'fast', quality: 'standard', maxDuration: 120, credits: 5,
    optimalParams: { styleWeight: 0.5, weirdnessConstraint: 0.5 },
    strengths: ['빠른 생성', '간단한 멜로디'],
    bestFor: ['pop', 'simple', 'demo'],
    desc: '빠르고 가벼운 프로토타이핑용'
  },
  V4: {
    name: 'V4', speed: 'normal', quality: 'high', maxDuration: 240, credits: 10,
    optimalParams: { styleWeight: 0.6, weirdnessConstraint: 0.5 },
    strengths: ['안정적 품질', '다양한 장르'],
    bestFor: ['pop', 'rock', 'hiphop', 'ballad', 'electronic', 'r&b', 'jazz'],
    desc: '가장 안정적인 범용 모델'
  },
  V4_5: {
    name: 'V4.5', speed: 'normal', quality: 'high', maxDuration: 240, credits: 12,
    optimalParams: { styleWeight: 0.65, weirdnessConstraint: 0.55 },
    strengths: ['균형잡힌 품질', '자연스러운 보컬'],
    bestFor: ['ballad', 'r&b', 'pop', 'lofi', 'acoustic', 'indie'],
    desc: '보컬 품질이 향상된 모델'
  },
  V4_5PLUS: {
    name: 'V4.5+', speed: 'slow', quality: 'premium', maxDuration: 480, credits: 20,
    optimalParams: { styleWeight: 0.65, weirdnessConstraint: 0.6 },
    strengths: ['8분 장곡', '최고 품질', '복잡한 편곡'],
    bestFor: ['cinematic', 'classical', 'epic', 'progressive', 'ambient'],
    desc: '장시간 고품질 곡에 최적'
  },
  V5: {
    name: 'V5', speed: 'normal', quality: 'premium', maxDuration: 240, credits: 15,
    optimalParams: { styleWeight: 0.7, weirdnessConstraint: 0.3, audioWeight: 0.5 },
    extraParams: ['audioWeight'],
    strengths: ['최신 AI', '자연스러운 보컬', '복잡한 편곡'],
    bestFor: ['all'],
    desc: '최신 기술의 프리미엄 모델',
    fallback: 'V4_5'
  },
  LYRIA_PRO: {
    name: 'Lyria 3 Pro', speed: 'fast', quality: 'standard', maxDuration: 120, credits: 8,
    optimalParams: { styleWeight: 0.5, weirdnessConstraint: 0.5 },
    strengths: ['빠른 생성', 'Google AI'],
    bestFor: ['pop', 'electronic', 'dance'],
    desc: 'Google 음악 AI (2분)'
  },
  LYRIA_CLIP: {
    name: 'Lyria 3 Clip', speed: 'fast', quality: 'standard', maxDuration: 30, credits: 3,
    optimalParams: { styleWeight: 0.5, weirdnessConstraint: 0.5 },
    strengths: ['초고속', '미리듣기용'],
    bestFor: ['pop', 'electronic'],
    desc: 'Google 음악 AI (30초 클립)'
  }
};

/* ── 장르-모델 추천 매핑 ── */
var _GENRE_MODEL_MAP = {
  'cinematic':   ['V4_5PLUS', 'V5'],
  'classical':   ['V4_5PLUS', 'V5'],
  'epic':        ['V4_5PLUS', 'V5'],
  'ambient':     ['V4_5PLUS', 'V4_5'],
  'progressive': ['V4_5PLUS', 'V5'],
  'ballad':      ['V4_5', 'V5'],
  'r&b':         ['V4_5', 'V5'],
  'lofi':        ['V4_5', 'LYRIA_PRO'],
  'acoustic':    ['V4_5', 'V4'],
  'indie':       ['V4_5', 'V4'],
  'jazz':        ['V4', 'V4_5'],
  'pop':         ['V4', 'V4_5', 'LYRIA_PRO'],
  'k-pop':       ['V4_5', 'V4'],
  'rock':        ['V4', 'V5'],
  'hiphop':      ['V4', 'V4_5'],
  'hip-hop':     ['V4', 'V4_5'],
  'electronic':  ['V4', 'LYRIA_PRO'],
  'dance':       ['V4', 'LYRIA_PRO'],
  'edm':         ['V4', 'LYRIA_PRO'],
  'metal':       ['V4', 'V5'],
  'punk':        ['V4', 'V3_5'],
};

/**
 * 장르/분위기 기반 모델 추천
 * @returns {{ model: string, reason: string }|null}
 */
function recommendModel(genre, mood, duration, isInstrumental) {
  if (!genre && !mood && !duration) return null;

  var g = (genre || '').toLowerCase().trim();
  var m = (mood || '').toLowerCase().trim();

  /* 8분+ 장곡이면 V4.5PLUS 권장 */
  if (duration && duration > 300) {
    return { model: 'V4_5PLUS', reason: g ? g + ' + 장시간 곡에 최적' : '8분 이상 장곡에 최적' };
  }

  /* 장르 매핑 검색 */
  if (g) {
    for (var key in _GENRE_MODEL_MAP) {
      if (g.includes(key)) {
        var rec = _GENRE_MODEL_MAP[key][0];
        return { model: rec, reason: key + ' 장르에 ' + MODEL_PROFILES[rec].name + '이 최적' };
      }
    }
  }

  /* 분위기 기반 추천 */
  if (m) {
    if (m.includes('epic') || m.includes('cinematic') || m.includes('grand'))
      return { model: 'V4_5PLUS', reason: '웅장한 분위기에 최적' };
    if (m.includes('calm') || m.includes('chill') || m.includes('relax'))
      return { model: 'V4_5', reason: '잔잔한 분위기에 최적' };
    if (m.includes('energetic') || m.includes('hype') || m.includes('party'))
      return { model: 'V4', reason: '에너지 넘치는 곡에 최적' };
  }

  return null;
}

/**
 * 모델 선택 시 최적 파라미터 적용
 */
function applyModelOptimalParams(modelKey) {
  var profile = MODEL_PROFILES[modelKey];
  if (!profile || !profile.optimalParams) return;

  var sw = document.getElementById('style-weight');
  var wc = document.getElementById('weird-constraint');
  if (sw) sw.value = profile.optimalParams.styleWeight;
  if (wc) wc.value = profile.optimalParams.weirdnessConstraint;

  /* 슬라이더 값 표시 업데이트 */
  var swVal = document.getElementById('sw-val');
  var wcVal = document.getElementById('wc-val');
  if (swVal) swVal.textContent = profile.optimalParams.styleWeight;
  if (wcVal) wcVal.textContent = profile.optimalParams.weirdnessConstraint;

  /* V5 audioWeight 슬라이더 토글 */
  var awGroup = document.getElementById('audio-weight-group');
  if (awGroup) {
    awGroup.style.display = (profile.extraParams && profile.extraParams.indexOf('audioWeight') >= 0) ? 'block' : 'none';
  }
}

/**
 * 모델 추천 배지 표시
 */
function showModelRecommendation(genre, mood) {
  var badge = document.getElementById('model-rec-badge');
  if (!badge) return;

  var rec = recommendModel(genre, mood);
  if (rec) {
    badge.style.display = 'inline-flex';
    badge.textContent = '💡 ' + MODEL_PROFILES[rec.model].name + ' 추천';
    badge.title = rec.reason;
    badge.dataset.recModel = rec.model;
  } else {
    badge.style.display = 'none';
  }
}

/**
 * 모델 변경 이벤트 초기화
 */
function initModelProfiles() {
  var sel = document.getElementById('model-sel');
  if (!sel) return;

  sel.addEventListener('change', function () {
    applyModelOptimalParams(this.value);
  });

  /* audioWeight 슬라이더 값 표시 */
  var awSlider = document.getElementById('audio-weight');
  var awVal = document.getElementById('aw-val');
  if (awSlider && awVal) {
    awSlider.addEventListener('input', function () { awVal.textContent = this.value; });
  }

  /* 장르/분위기 변경 시 모델 추천 업데이트 */
  var genreSel = document.getElementById('genre-sub');
  var moodSel = document.getElementById('mood');
  function _updateModelRec() {
    showModelRecommendation(
      (genreSel ? genreSel.value : ''),
      (moodSel ? moodSel.value : '')
    );
  }
  if (genreSel) genreSel.addEventListener('change', _updateModelRec);
  if (moodSel) moodSel.addEventListener('change', _updateModelRec);

  /* 추천 배지 클릭 시 해당 모델 선택 */
  var badge = document.getElementById('model-rec-badge');
  if (badge) {
    badge.addEventListener('click', function () {
      var recModel = this.dataset.recModel;
      if (recModel && sel) {
        sel.value = recModel;
        applyModelOptimalParams(recModel);
        if (typeof toast === 'function') toast('🤖 ' + MODEL_PROFILES[recModel].name + ' 모델로 변경됐어요', 'ok', 2000);
      }
    });
  }
}

/**
 * A/B 테스트 — 동일 프롬프트를 현재 모델 + 추천 모델로 동시 생성
 */
function _abTestGenerate() {
  var sel = document.getElementById('model-sel');
  if (!sel) return;
  var currentModel = sel.value;

  /* 추천 모델 또는 대비 모델 선택 */
  var genreSel = document.getElementById('genre-sub');
  var moodSel = document.getElementById('mood');
  var rec = recommendModel(
    genreSel ? genreSel.value : '',
    moodSel ? moodSel.value : ''
  );
  var altModel = rec ? rec.model : null;

  /* 현재 모델과 같으면 다른 모델 선택 */
  if (!altModel || altModel === currentModel) {
    var fallbacks = ['V4', 'V4_5', 'V5', 'V4_5PLUS'];
    for (var i = 0; i < fallbacks.length; i++) {
      if (fallbacks[i] !== currentModel) { altModel = fallbacks[i]; break; }
    }
  }

  if (typeof toast === 'function') {
    toast('🔬 A/B 테스트: ' + MODEL_PROFILES[currentModel].name + ' vs ' + MODEL_PROFILES[altModel].name, 'ok', 3000);
  }

  /* 첫 번째 생성 (현재 모델) */
  if (typeof generate === 'function') {
    generate({ _abTest: true, _abModel: currentModel });
  }

  /* A/B 결과 저장소 초기화 */
  window._abResults = { modelA: currentModel, modelB: altModel, trackA: null, trackB: null };

  /* 두 번째 생성을 큐에 추가 (다른 모델) */
  if (typeof _QueueManager !== 'undefined') {
    _QueueManager.enqueue('music', { params: { _abTest: true, _abModel: altModel }, mode: 'custom' });
  }
}

/**
 * A/B 결과 수집 — generate 완료 후 호출
 */
function _collectABResult(model, track) {
  if (!window._abResults) return;
  if (model === window._abResults.modelA && !window._abResults.trackA) {
    window._abResults.trackA = track;
  } else if (!window._abResults.trackB) {
    window._abResults.trackB = track;
  }
  /* 양쪽 모두 완료되면 비교 UI 표시 */
  if (window._abResults.trackA && window._abResults.trackB) {
    _renderABComparison(window._abResults);
  }
}

/**
 * A/B 비교 UI 렌더링
 */
function _renderABComparison(ab) {
  var container = document.getElementById('results');
  if (!container) return;
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var profA = MODEL_PROFILES[ab.modelA] || { name: ab.modelA };
  var profB = MODEL_PROFILES[ab.modelB] || { name: ab.modelB };

  var html = '<div style="margin-top:16px;padding:16px;background:linear-gradient(135deg,rgba(124,58,237,.08),rgba(59,130,246,.08));border:1px solid rgba(124,58,237,.2);border-radius:14px;">';
  html += '<div style="text-align:center;font-size:14px;font-weight:800;color:var(--t1);margin-bottom:12px;">🔬 A/B 모델 비교</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';

  /* Model A */
  html += '<div style="padding:12px;background:var(--card);border-radius:10px;border:2px solid rgba(124,58,237,.3);">';
  html += '<div style="text-align:center;font-size:12px;font-weight:700;color:var(--acc);margin-bottom:8px;">A: ' + esc(profA.name) + '</div>';
  html += '<div style="font-size:12px;color:var(--t1);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(ab.trackA.title || '트랙 A') + '</div>';
  var urlA = ab.trackA.audioUrl || ab.trackA.audio_url || ab.trackA.song_path || '';
  html += '<audio controls src="' + esc(urlA) + '" style="width:100%;height:36px;border-radius:6px;"></audio>';
  html += '<button onclick="_voteAB(\'A\')" class="stem-btn" style="width:100%;margin-top:8px;padding:8px;font-size:12px;">👍 A가 더 좋아요</button>';
  html += '</div>';

  /* Model B */
  html += '<div style="padding:12px;background:var(--card);border-radius:10px;border:2px solid rgba(59,130,246,.3);">';
  html += '<div style="text-align:center;font-size:12px;font-weight:700;color:#60a5fa;margin-bottom:8px;">B: ' + esc(profB.name) + '</div>';
  html += '<div style="font-size:12px;color:var(--t1);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(ab.trackB.title || '트랙 B') + '</div>';
  var urlB = ab.trackB.audioUrl || ab.trackB.audio_url || ab.trackB.song_path || '';
  html += '<audio controls src="' + esc(urlB) + '" style="width:100%;height:36px;border-radius:6px;"></audio>';
  html += '<button onclick="_voteAB(\'B\')" class="stem-btn" style="width:100%;margin-top:8px;padding:8px;font-size:12px;">👍 B가 더 좋아요</button>';
  html += '</div>';

  html += '</div></div>';
  container.insertAdjacentHTML('beforeend', html);
}

function _voteAB(choice) {
  if (!window._abResults) return;
  var winner = choice === 'A' ? window._abResults.modelA : window._abResults.modelB;
  /* localStorage에 투표 기록 */
  try {
    var votes = JSON.parse(localStorage.getItem('kms_ab_votes') || '[]');
    votes.push({ winner: winner, loser: choice === 'A' ? window._abResults.modelB : window._abResults.modelA, ts: Date.now() });
    if (votes.length > 50) votes = votes.slice(-50);
    localStorage.setItem('kms_ab_votes', JSON.stringify(votes));
  } catch (e) {}
  if (typeof toast === 'function') toast('👍 ' + MODEL_PROFILES[winner].name + ' 선택! 다음 추천에 반영됩니다', 'ok', 2500);
  window._abResults = null;
}
