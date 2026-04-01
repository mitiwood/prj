/**
 * stem-mixer.js — Web Audio API 기반 스템 믹서
 * 14트랙 스템 개별 재생/볼륨/뮤트/솔로 + ZIP 일괄 다운로드
 */

var _stemCtx = null;
var _stemChannels = {}; /* key: stem label, val: { audio, source, gain, analyser, muted, soloed, volume } */
var _stemMasterGain = null;
var _stemPlaying = false;
var _stemOrigAudio = null; /* A/B 비교용 원본 */
var _stemABMode = 'mix'; /* 'mix' or 'original' */

var _STEM_ICONS = {
  'vocals':'🎤','drums':'🥁','bass':'🎸','guitar':'🎸','piano':'🎹',
  'keys':'🎹','percussion':'🪘','strings':'🎻','synth':'🎛','brass':'🎺',
  'woodwinds':'🪈','fx':'✨','backing vocals':'🎤','instrumental':'🎵',
  'MR':'🎵','Vocal':'🎤'
};

function _ensureStemCtx() {
  if (!_stemCtx || _stemCtx.state === 'closed') {
    _stemCtx = new (window.AudioContext || window.webkitAudioContext)();
    _stemMasterGain = _stemCtx.createGain();
    _stemMasterGain.connect(_stemCtx.destination);
  }
  if (_stemCtx.state === 'suspended') _stemCtx.resume();
  return _stemCtx;
}

/**
 * 스템 믹서 렌더링
 * @param {Array} stems - [{label, url}]
 * @param {string} title - 곡 제목
 * @param {string} origUrl - 원본 오디오 URL (A/B 비교용)
 */
function renderStemMixer(stems, title, origUrl) {
  _cleanupStemMixer();
  var ctx = _ensureStemCtx();
  var container = document.getElementById('vr-mixer-area');
  if (!container) return;

  /* 채널 생성 */
  stems.forEach(function (s) {
    var audio = new Audio(s.url);
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    var source = ctx.createMediaElementSource(audio);
    var gain = ctx.createGain();
    var analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(gain);
    gain.connect(analyser);
    analyser.connect(_stemMasterGain);
    _stemChannels[s.label] = {
      audio: audio, source: source, gain: gain, analyser: analyser,
      muted: false, soloed: false, volume: 0.8, url: s.url
    };
  });

  /* A/B 원본 */
  if (origUrl) {
    _stemOrigAudio = new Audio(origUrl);
    _stemOrigAudio.preload = 'auto';
  }

  /* UI 렌더링 */
  var html = '<div class="stem-mixer-wrap">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">';
  html += '<div style="font-size:14px;font-weight:700;color:var(--t1);">🎛 스템 믹서</div>';
  html += '<div style="display:flex;gap:6px;">';
  if (origUrl) {
    html += '<button class="stem-btn" id="stem-ab-btn" onclick="_toggleStemAB()" title="원본/믹스 비교">A/B</button>';
  }
  html += '<button class="stem-btn" id="stem-play-btn" onclick="_toggleStemPlay()">▶ 재생</button>';
  html += '<button class="stem-btn" onclick="_downloadStemsZip()">📦 ZIP 다운로드</button>';
  html += '</div></div>';

  /* 마스터 */
  html += '<div class="stem-ch stem-master"><span class="stem-icon">🎚</span><span class="stem-label">마스터</span>';
  html += '<input type="range" class="stem-slider" min="0" max="1" step="0.01" value="0.8" oninput="_setStemMaster(this.value)">';
  html += '<span class="stem-db" id="stem-master-db">0dB</span></div>';

  /* 개별 채널 */
  var keys = Object.keys(_stemChannels);
  keys.forEach(function (key) {
    var icon = _STEM_ICONS[key.toLowerCase()] || '🎵';
    html += '<div class="stem-ch" data-stem="' + key + '">';
    html += '<span class="stem-icon">' + icon + '</span>';
    html += '<span class="stem-label">' + key + '</span>';
    html += '<button class="stem-mute-btn" onclick="_toggleStemMute(\'' + key + '\',this)" title="뮤트">M</button>';
    html += '<button class="stem-solo-btn" onclick="_toggleStemSolo(\'' + key + '\',this)" title="솔로">S</button>';
    html += '<input type="range" class="stem-slider" min="0" max="1" step="0.01" value="0.8" oninput="_setStemVolume(\'' + key + '\',this.value)">';
    html += '<canvas class="stem-meter" id="meter-' + key.replace(/\s/g, '_') + '" width="40" height="12"></canvas>';
    html += '<a href="' + _stemChannels[key].url + '" download="' + key + '.mp3" class="stem-dl" title="다운로드">⬇</a>';
    html += '</div>';
  });

  html += '</div>';

  /* CSS */
  html += '<style>';
  html += '.stem-mixer-wrap{padding:12px;background:rgba(20,20,40,.9);border-radius:12px;margin-top:8px;}';
  html += '.stem-ch{display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05);}';
  html += '.stem-master{border-bottom:2px solid rgba(124,58,237,.3);margin-bottom:4px;padding-bottom:8px;}';
  html += '.stem-icon{font-size:14px;width:20px;text-align:center;}';
  html += '.stem-label{font-size:11px;color:var(--t2);width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}';
  html += '.stem-slider{flex:1;height:4px;accent-color:var(--acc);}';
  html += '.stem-db{font-size:10px;color:var(--t3);width:30px;text-align:right;}';
  html += '.stem-meter{border-radius:2px;}';
  html += '.stem-mute-btn,.stem-solo-btn{width:22px;height:22px;border:1px solid rgba(255,255,255,.15);border-radius:4px;background:transparent;color:var(--t3);font-size:10px;font-weight:700;cursor:pointer;padding:0;}';
  html += '.stem-mute-btn.on{background:rgba(239,68,68,.8);color:#fff;border-color:rgba(239,68,68,.8);}';
  html += '.stem-solo-btn.on{background:rgba(251,191,36,.8);color:#000;border-color:rgba(251,191,36,.8);}';
  html += '.stem-btn{padding:4px 10px;border-radius:8px;border:1px solid rgba(124,58,237,.3);background:rgba(124,58,237,.1);color:var(--acc);font-size:11px;font-weight:600;cursor:pointer;}';
  html += '.stem-dl{font-size:12px;text-decoration:none;opacity:.6;} .stem-dl:hover{opacity:1;}';
  html += '</style>';

  container.innerHTML = html;
  _startStemMeters();
}

function _setStemMaster(val) {
  if (_stemMasterGain) _stemMasterGain.gain.value = parseFloat(val);
}

function _setStemVolume(key, val) {
  var ch = _stemChannels[key];
  if (!ch) return;
  ch.volume = parseFloat(val);
  if (!ch.muted) ch.gain.gain.value = ch.volume;
}

function _toggleStemMute(key, btn) {
  var ch = _stemChannels[key];
  if (!ch) return;
  ch.muted = !ch.muted;
  ch.gain.gain.value = ch.muted ? 0 : ch.volume;
  if (btn) btn.classList.toggle('on', ch.muted);
}

function _toggleStemSolo(key, btn) {
  var ch = _stemChannels[key];
  if (!ch) return;
  ch.soloed = !ch.soloed;
  if (btn) btn.classList.toggle('on', ch.soloed);

  /* 솔로가 하나라도 있으면 솔로만 출력 */
  var hasSolo = false;
  for (var k in _stemChannels) { if (_stemChannels[k].soloed) { hasSolo = true; break; } }
  for (var k2 in _stemChannels) {
    var c = _stemChannels[k2];
    if (hasSolo) {
      c.gain.gain.value = c.soloed ? c.volume : 0;
    } else {
      c.gain.gain.value = c.muted ? 0 : c.volume;
    }
  }
}

function _toggleStemPlay() {
  var btn = document.getElementById('stem-play-btn');
  if (_stemPlaying) {
    _stemPlaying = false;
    for (var k in _stemChannels) _stemChannels[k].audio.pause();
    if (_stemOrigAudio) _stemOrigAudio.pause();
    if (btn) btn.textContent = '▶ 재생';
  } else {
    if (_stemCtx && _stemCtx.state === 'suspended') _stemCtx.resume();
    _stemPlaying = true;
    if (_stemABMode === 'original' && _stemOrigAudio) {
      _stemOrigAudio.play().catch(function () {});
    } else {
      var keys = Object.keys(_stemChannels);
      keys.forEach(function (k) { _stemChannels[k].audio.play().catch(function () {}); });
    }
    if (btn) btn.textContent = '⏸ 정지';
  }
}

function _toggleStemAB() {
  var btn = document.getElementById('stem-ab-btn');
  if (_stemABMode === 'mix') {
    _stemABMode = 'original';
    /* 믹스 멈추고 원본 재생 */
    var curTime = 0;
    for (var k in _stemChannels) {
      curTime = _stemChannels[k].audio.currentTime;
      _stemChannels[k].audio.pause();
    }
    if (_stemOrigAudio) {
      _stemOrigAudio.currentTime = curTime;
      if (_stemPlaying) _stemOrigAudio.play().catch(function () {});
    }
    if (btn) { btn.textContent = '원본'; btn.style.background = 'rgba(59,130,246,.3)'; }
  } else {
    _stemABMode = 'mix';
    var curTime2 = _stemOrigAudio ? _stemOrigAudio.currentTime : 0;
    if (_stemOrigAudio) _stemOrigAudio.pause();
    for (var k2 in _stemChannels) {
      _stemChannels[k2].audio.currentTime = curTime2;
      if (_stemPlaying) _stemChannels[k2].audio.play().catch(function () {});
    }
    if (btn) { btn.textContent = 'A/B'; btn.style.background = 'rgba(124,58,237,.1)'; }
  }
}

/* 레벨 미터 애니메이션 */
var _stemMeterRAF = null;
function _startStemMeters() {
  function draw() {
    for (var k in _stemChannels) {
      var ch = _stemChannels[k];
      var canvas = document.getElementById('meter-' + k.replace(/\s/g, '_'));
      if (!canvas || !ch.analyser) continue;
      var ctx2d = canvas.getContext('2d');
      var data = new Uint8Array(ch.analyser.frequencyBinCount);
      ch.analyser.getByteFrequencyData(data);
      var avg = 0;
      for (var i = 0; i < data.length; i++) avg += data[i];
      avg = avg / data.length / 255;
      ctx2d.clearRect(0, 0, 40, 12);
      var grad = ctx2d.createLinearGradient(0, 0, 40, 0);
      grad.addColorStop(0, '#22c55e'); grad.addColorStop(0.7, '#fbbf24'); grad.addColorStop(1, '#ef4444');
      ctx2d.fillStyle = grad;
      ctx2d.fillRect(0, 1, avg * 40, 10);
    }
    _stemMeterRAF = requestAnimationFrame(draw);
  }
  draw();
}

/* ZIP 일괄 다운로드 */
async function _downloadStemsZip() {
  var keys = Object.keys(_stemChannels);
  if (!keys.length) return;

  /* JSZip 동적 로드 */
  if (typeof JSZip === 'undefined') {
    try {
      await new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    } catch (e) {
      if (typeof toast === 'function') toast('ZIP 라이브러리 로드 실패', 'err', 3000);
      return;
    }
  }

  if (typeof toast === 'function') toast('📦 스템 다운로드 준비 중...', '', 2000);
  var zip = new JSZip();
  var count = 0;

  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    try {
      var r = await fetch(_stemChannels[k].url);
      var blob = await r.blob();
      zip.file(k + '.mp3', blob);
      count++;
      if (typeof toast === 'function' && count % 4 === 0) toast('📦 다운로드 중 ' + count + '/' + keys.length, '', 1000);
    } catch (e) { console.warn('[stem-zip]', k, e.message); }
  }

  var content = await zip.generateAsync({ type: 'blob' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = 'stems.zip';
  a.click();
  URL.revokeObjectURL(a.href);
  if (typeof toast === 'function') toast('📦 ' + count + '개 스템 다운로드 완료!', 'ok', 3000);
}

function _cleanupStemMixer() {
  if (_stemMeterRAF) { cancelAnimationFrame(_stemMeterRAF); _stemMeterRAF = null; }
  for (var k in _stemChannels) {
    try { _stemChannels[k].audio.pause(); _stemChannels[k].audio.removeAttribute('src'); } catch (e) {}
  }
  _stemChannels = {};
  if (_stemOrigAudio) { _stemOrigAudio.pause(); _stemOrigAudio = null; }
  _stemPlaying = false;
  _stemABMode = 'mix';
}
