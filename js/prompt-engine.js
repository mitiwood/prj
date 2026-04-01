/**
 * prompt-engine.js — 프롬프트 엔진 고도화
 * 1. 모델별 최적 프롬프트 포맷
 * 2. NLP 파싱 강화 (다중 키워드)
 * 3. 품질 점수 개선 + 개선 제안
 * 4. 프롬프트 히스토리 북마크
 */

/* ── 1. 모델별 최적 스타일 길이 ── */
var _MODEL_STYLE_LIMITS = {
  V3_5: 500, V4: 800, V4_5: 800, V4_5PLUS: 1000, V5: 1000,
  LYRIA_PRO: 500, LYRIA_CLIP: 300
};

/**
 * buildOptimalPrompt 확장 — 모델별 길이 제한 적용
 */
function optimizePromptForModel(prompt, styleStr, modelKey) {
  var maxStyle = _MODEL_STYLE_LIMITS[modelKey] || 800;
  if (styleStr && styleStr.length > maxStyle) {
    styleStr = styleStr.slice(0, maxStyle - 3) + '...';
  }
  return { prompt: prompt, style: styleStr };
}

/* ── 2. NLP 파싱 강화 (다중 키워드 매칭) ── */
var _NLP_GENRE_MAP_EXT = {
  '케이팝': 'K-Pop Dance', 'k-pop': 'K-Pop Dance', 'kpop': 'K-Pop Dance',
  '발라드': 'Ballad', 'ballad': 'Ballad',
  '힙합': 'Trap', 'hip-hop': 'Trap', 'hiphop': 'Trap', '랩': 'Trap',
  '트랩': 'Trap', 'trap': 'Trap',
  '로파이': 'Lo-Fi Hip Hop', 'lofi': 'Lo-Fi Hip Hop', 'lo-fi': 'Lo-Fi Hip Hop',
  '재즈': 'Jazz', 'jazz': 'Jazz',
  '클래식': 'Cinematic', 'classical': 'Cinematic', '오케스트라': 'Cinematic',
  '어쿠스틱': 'Acoustic Pop', 'acoustic': 'Acoustic Pop',
  '록': 'Indie Rock', 'rock': 'Indie Rock', '인디': 'Indie Rock',
  '일렉': 'Future Bass', 'electronic': 'Future Bass', 'edm': 'Future Bass',
  '시티팝': 'City Pop', 'city pop': 'City Pop',
  '트로트': 'Trot', 'trot': 'Trot',
  '알앤비': 'R&B', 'r&b': 'R&B', 'rnb': 'R&B',
  '팝': 'Pop', 'pop': 'Pop',
  '앰비언트': 'Ambient', 'ambient': 'Ambient',
  '신스웨이브': 'Synthwave', 'synthwave': 'Synthwave',
  '메탈': 'Metal', 'metal': 'Metal',
  '펑크': 'Punk', 'punk': 'Punk',
};

var _NLP_MOOD_MAP_EXT = {
  '신나는': 'energetic, hype', '밝은': 'happy, uplifting', '에너지': 'energetic, hype',
  '슬픈': 'sad, emotional', '감성': 'sad, emotional', '우울': 'melancholic',
  '잔잔': 'calm, relaxing', '편안': 'calm, relaxing', '칠': 'chill, lofi',
  '어두운': 'dark, intense', '강렬': 'dark, intense', '무서운': 'dark, haunting',
  '로맨틱': 'romantic, dreamy', '몽환': 'romantic, dreamy', '꿈같은': 'dreamy',
  '웅장': 'epic, cinematic', '영화': 'epic, cinematic', '장엄': 'grand, epic',
  '노스탤지': 'nostalgic, retro', '레트로': 'nostalgic, retro', '복고': 'retro',
  '파티': 'party, hype', '축제': 'festival, energetic',
  'upbeat': 'energetic, hype', 'sad': 'sad, emotional', 'chill': 'chill, lofi',
  'dark': 'dark, intense', 'epic': 'epic, cinematic', 'romantic': 'romantic, dreamy',
  'calm': 'calm, relaxing', 'happy': 'happy, uplifting', 'energetic': 'energetic, hype',
  '비 오는': 'melancholic, rainy', '카페': 'chill, lofi, cafe',
  '새벽': 'late night, introspective', '밤': 'nocturnal, moody',
};

var _NLP_TEMPO_MAP_EXT = {
  '빠른': 140, '빠르게': 140, 'fast': 140, '업비트': 130,
  '느린': 70, '느리게': 70, 'slow': 70,
  '중간': 110, 'medium': 110, '보통': 110,
};

/**
 * 자연어에서 장르/분위기/템포 동시 추출 (다중 매칭)
 */
function parseNaturalLanguageEnhanced(text) {
  if (!text) return {};
  var lower = text.toLowerCase();
  var result = { genres: [], moods: [], tempo: null };

  /* 장르 (다중) */
  for (var gk in _NLP_GENRE_MAP_EXT) {
    if (lower.includes(gk)) {
      var val = _NLP_GENRE_MAP_EXT[gk];
      if (result.genres.indexOf(val) === -1) result.genres.push(val);
    }
  }

  /* 분위기 (다중) */
  for (var mk in _NLP_MOOD_MAP_EXT) {
    if (lower.includes(mk)) {
      var mVal = _NLP_MOOD_MAP_EXT[mk];
      if (result.moods.indexOf(mVal) === -1) result.moods.push(mVal);
    }
  }

  /* 템포 */
  for (var tk in _NLP_TEMPO_MAP_EXT) {
    if (lower.includes(tk)) {
      result.tempo = _NLP_TEMPO_MAP_EXT[tk];
      break;
    }
  }
  /* 숫자 BPM */
  var bpmMatch = text.match(/(\d{2,3})\s*bpm/i);
  if (bpmMatch) result.tempo = parseInt(bpmMatch[1]);

  return result;
}

/* ── 3. 품질 점수 개선 + 제안 ── */
function calculatePromptQuality(opts) {
  var genre = opts.genre || '';
  var mood = opts.mood || '';
  var desc = opts.desc || '';
  var bpm = opts.bpm || '';
  var bpmAuto = opts.bpmAuto !== false;
  var insts = opts.instruments || '';
  var ref = opts.ref || '';
  var lang = opts.lang || '';
  var model = opts.model || '';

  var score = 0;
  var suggestions = [];

  /* 장르 (30점) */
  if (genre) score += 30;
  else suggestions.push({ text: '장르를 선택하면 +30점', field: 'genre-sub' });

  /* 분위기 (15점) */
  if (mood) score += 15;
  else suggestions.push({ text: '분위기를 선택하면 +15점', field: 'mood' });

  /* 설명 (20점, 길이별 차등) */
  if (desc) {
    var dl = desc.length;
    if (dl < 20) { score += 10; suggestions.push({ text: '설명을 더 구체적으로 쓰면 +10점', field: 'song-desc' }); }
    else if (dl < 50) score += 15;
    else score += 20;
  } else {
    suggestions.push({ text: '곡 설명을 입력하면 +20점', field: 'song-desc' });
  }

  /* BPM (5점) */
  if (bpm && !bpmAuto) score += 5;

  /* 악기 (10점, 수 기반) */
  if (insts) {
    var instCount = insts.split(',').length;
    if (instCount >= 2 && instCount <= 4) score += 10;
    else if (instCount === 1) { score += 5; suggestions.push({ text: '악기를 2~4개 선택하면 +5점', field: 'instruments' }); }
    else score += 8;
  } else {
    suggestions.push({ text: '악기를 선택하면 +10점', field: 'instruments' });
  }

  /* 참조 아티스트 (10점) */
  if (ref) score += 10;

  /* 언어 (5점) */
  if (lang) score += 5;

  /* 보너스: negative tags */
  var negTags = (document.getElementById('neg-tags')?.value || '').trim();
  if (negTags) score += 3;

  score = Math.min(score, 100);

  /* 최대 3개 제안만 */
  suggestions = suggestions.slice(0, 3);

  return { score: score, suggestions: suggestions };
}

/**
 * 프롬프트 미리보기에 개선 제안 표시
 */
function renderPromptSuggestions(suggestions) {
  var el = document.getElementById('prompt-suggestions');
  if (!el) return;
  if (!suggestions || !suggestions.length) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  el.innerHTML = suggestions.map(function (s) {
    return '<div class="pp-suggestion" onclick="var f=document.getElementById(\'' + s.field + '\');if(f){f.focus();f.scrollIntoView({behavior:\'smooth\',block:\'center\'});}" style="cursor:pointer;font-size:11px;color:#fbbf24;padding:2px 0;">💡 ' + s.text + '</div>';
  }).join('');
}

/* ── 4. 프롬프트 히스토리 북마크 ── */
var _MAX_BOOKMARKS = 10;

function getGenHistory() {
  try { return JSON.parse(localStorage.getItem('kms_gen_history') || '[]'); } catch { return []; }
}

function toggleGenHistoryBookmark(idx) {
  var hist = getGenHistory();
  if (!hist[idx]) return;
  hist[idx].bookmarked = !hist[idx].bookmarked;

  /* 북마크 최대 개수 체크 */
  var bookmarked = hist.filter(function (h) { return h.bookmarked; });
  if (bookmarked.length > _MAX_BOOKMARKS) {
    if (typeof toast === 'function') toast('북마크는 최대 ' + _MAX_BOOKMARKS + '개까지 가능해요', 'err', 2000);
    hist[idx].bookmarked = false;
    return;
  }

  localStorage.setItem('kms_gen_history', JSON.stringify(hist));
  if (typeof toast === 'function') toast(hist[idx].bookmarked ? '⭐ 북마크 저장!' : '북마크 해제', 'ok', 1500);
  if (typeof _renderGenHistory === 'function') _renderGenHistory();
}

function saveGenHistoryEntry(entry) {
  var hist = getGenHistory();
  /* 북마크되지 않은 오래된 항목부터 밀어내기 */
  hist.unshift(entry);
  var bookmarked = hist.filter(function (h) { return h.bookmarked; });
  var nonBookmarked = hist.filter(function (h) { return !h.bookmarked; });
  if (nonBookmarked.length > 20) nonBookmarked = nonBookmarked.slice(0, 20);
  hist = bookmarked.concat(nonBookmarked);
  localStorage.setItem('kms_gen_history', JSON.stringify(hist));
}
