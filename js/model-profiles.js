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
