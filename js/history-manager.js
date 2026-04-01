/**
 * history-manager.js — 히스토리 강화 모듈
 * 1. 검색/필터링  2. 통계 대시보드  3. 내보내기/가져오기
 */

/* ── 1. 검색/필터링 ── */
var _histSearchQuery = '';
var _histFilterGenre = '';
var _histFilterMode = '';
var _histFilterDate = '';

function histSearch(query) {
  _histSearchQuery = (query || '').toLowerCase().trim();
  if (typeof renderHistoryView === 'function') renderHistoryView();
}

function histFilterGenre(genre) {
  _histFilterGenre = genre || '';
  if (typeof renderHistoryView === 'function') renderHistoryView();
}

function histFilterMode(mode) {
  _histFilterMode = mode || '';
  if (typeof renderHistoryView === 'function') renderHistoryView();
}

function histFilterDate(range) {
  _histFilterDate = range || '';
  if (typeof renderHistoryView === 'function') renderHistoryView();
}

/**
 * 히스토리 데이터를 검색/필터 적용하여 반환
 */
function getFilteredHistory(data) {
  if (!data) return [];
  var result = data;

  /* 검색어 필터 */
  if (_histSearchQuery) {
    result = result.filter(function (h) {
      var title = (h.title || '').toLowerCase();
      var tags = (h.tags || '').toLowerCase();
      var lyrics = (h.lyrics || '').toLowerCase();
      return title.includes(_histSearchQuery) || tags.includes(_histSearchQuery) || lyrics.includes(_histSearchQuery);
    });
  }

  /* 장르 필터 */
  if (_histFilterGenre) {
    result = result.filter(function (h) {
      return (h.tags || '').toLowerCase().includes(_histFilterGenre.toLowerCase());
    });
  }

  /* 모드 필터 */
  if (_histFilterMode) {
    result = result.filter(function (h) {
      return h.genMode === _histFilterMode;
    });
  }

  /* 날짜 필터 */
  if (_histFilterDate) {
    var now = Date.now();
    var cutoff = 0;
    switch (_histFilterDate) {
      case 'today': cutoff = now - 24 * 60 * 60 * 1000; break;
      case 'week': cutoff = now - 7 * 24 * 60 * 60 * 1000; break;
      case 'month': cutoff = now - 30 * 24 * 60 * 60 * 1000; break;
    }
    if (cutoff) {
      result = result.filter(function (h) { return (h.created || 0) >= cutoff; });
    }
  }

  return result;
}

/* ── 2. 통계 대시보드 ── */
function calculateHistStats(data) {
  if (!data || !data.length) return null;
  var now = new Date();
  var thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  var stats = {
    total: data.length,
    thisMonth: 0,
    byGenre: {},
    byMode: {},
    byModel: {},
    byMonth: {},
    totalPlays: 0,
    totalLikes: 0,
  };

  data.forEach(function (h) {
    /* 이번 달 */
    var d = new Date(h.created || 0);
    var ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (ym === thisMonth) stats.thisMonth++;

    /* 월별 */
    stats.byMonth[ym] = (stats.byMonth[ym] || 0) + 1;

    /* 장르 (첫 번째 태그) */
    var genre = (h.tags || '').split(',')[0].trim();
    if (genre) stats.byGenre[genre] = (stats.byGenre[genre] || 0) + 1;

    /* 모드 */
    var mode = h.genMode || 'unknown';
    stats.byMode[mode] = (stats.byMode[mode] || 0) + 1;

    /* 모델 */
    var model = h.model || 'unknown';
    stats.byModel[model] = (stats.byModel[model] || 0) + 1;

    /* 재생/좋아요 */
    stats.totalPlays += h.play_count || 0;
    stats.totalLikes += h.likes || 0;
  });

  return stats;
}

function renderHistStats(data) {
  var container = document.getElementById('hist-stats-panel');
  if (!container) return;
  var stats = calculateHistStats(data);
  if (!stats) { container.innerHTML = '<div style="color:var(--t3);font-size:12px;text-align:center;padding:20px;">생성된 곡이 없어요</div>'; return; }

  var html = '<div class="hs-grid">';

  /* 총/이번달 */
  html += '<div class="hs-card"><div class="hs-num">' + stats.total + '</div><div class="hs-label">총 생성곡</div></div>';
  html += '<div class="hs-card"><div class="hs-num">' + stats.thisMonth + '</div><div class="hs-label">이번 달</div></div>';
  html += '<div class="hs-card"><div class="hs-num">' + stats.totalPlays + '</div><div class="hs-label">총 재생</div></div>';
  html += '<div class="hs-card"><div class="hs-num">' + stats.totalLikes + '</div><div class="hs-label">총 좋아요</div></div>';

  html += '</div>';

  /* 장르 분포 (도넛 → 바 차트) */
  var genres = Object.entries(stats.byGenre).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6);
  if (genres.length) {
    var maxG = genres[0][1];
    html += '<div class="hs-section"><div class="hs-title">🎵 장르 분포</div>';
    genres.forEach(function (g) {
      var pct = Math.round(g[1] / stats.total * 100);
      html += '<div class="hs-bar-row"><span class="hs-bar-label">' + g[0] + '</span>';
      html += '<div class="hs-bar"><div class="hs-bar-fill" style="width:' + (g[1] / maxG * 100) + '%;"></div></div>';
      html += '<span class="hs-bar-val">' + g[1] + ' (' + pct + '%)</span></div>';
    });
    html += '</div>';
  }

  /* 모드 분포 */
  var modes = Object.entries(stats.byMode).sort(function (a, b) { return b[1] - a[1]; });
  var modeLabels = { custom: '커스텀', simple: '심플', youtube: 'YouTube', mv: 'MV', extend: '연장', 'vocal-removal': '보컬분리', cover: '커버' };
  if (modes.length) {
    html += '<div class="hs-section"><div class="hs-title">🎛 생성 모드</div><div class="hs-chips">';
    modes.forEach(function (m) {
      html += '<span class="hs-chip">' + (modeLabels[m[0]] || m[0]) + ' <b>' + m[1] + '</b></span>';
    });
    html += '</div></div>';
  }

  /* 월별 추이 (최근 6개월) */
  var months = Object.keys(stats.byMonth).sort().slice(-6);
  if (months.length > 1) {
    var maxM = Math.max.apply(null, months.map(function (m) { return stats.byMonth[m]; }));
    html += '<div class="hs-section"><div class="hs-title">📈 월별 생성 추이</div><div class="hs-chart">';
    months.forEach(function (m) {
      var val = stats.byMonth[m];
      var h2 = Math.round(val / maxM * 60);
      html += '<div class="hs-col"><div class="hs-col-bar" style="height:' + h2 + 'px;"></div><div class="hs-col-label">' + m.slice(5) + '월</div><div class="hs-col-val">' + val + '</div></div>';
    });
    html += '</div></div>';
  }

  /* CSS */
  html += '<style>';
  html += '.hs-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;}';
  html += '.hs-card{background:rgba(124,58,237,.08);border-radius:10px;padding:10px;text-align:center;}';
  html += '.hs-num{font-size:20px;font-weight:800;color:var(--acc);}';
  html += '.hs-label{font-size:10px;color:var(--t3);margin-top:2px;}';
  html += '.hs-section{margin-bottom:12px;}';
  html += '.hs-title{font-size:12px;font-weight:700;color:var(--t1);margin-bottom:8px;}';
  html += '.hs-bar-row{display:flex;align-items:center;gap:6px;margin-bottom:4px;}';
  html += '.hs-bar-label{font-size:11px;color:var(--t2);width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}';
  html += '.hs-bar{flex:1;height:8px;background:rgba(255,255,255,.05);border-radius:4px;overflow:hidden;}';
  html += '.hs-bar-fill{height:100%;background:linear-gradient(90deg,var(--acc),var(--acc2));border-radius:4px;transition:width .3s;}';
  html += '.hs-bar-val{font-size:10px;color:var(--t3);width:55px;text-align:right;}';
  html += '.hs-chips{display:flex;flex-wrap:wrap;gap:6px;}';
  html += '.hs-chip{padding:4px 10px;background:rgba(255,255,255,.05);border-radius:8px;font-size:11px;color:var(--t2);}';
  html += '.hs-chip b{color:var(--acc);margin-left:3px;}';
  html += '.hs-chart{display:flex;align-items:flex-end;gap:8px;height:80px;}';
  html += '.hs-col{display:flex;flex-direction:column;align-items:center;flex:1;}';
  html += '.hs-col-bar{width:100%;max-width:30px;background:linear-gradient(180deg,var(--acc),var(--acc2));border-radius:4px 4px 0 0;min-height:4px;}';
  html += '.hs-col-label{font-size:9px;color:var(--t3);margin-top:4px;}';
  html += '.hs-col-val{font-size:10px;color:var(--t2);font-weight:600;}';
  html += '</style>';

  container.innerHTML = html;
}

/* ── 3. 내보내기/가져오기 ── */
function exportHistory() {
  var data = {
    version: 1,
    exported: new Date().toISOString(),
    tracks: typeof historyData !== 'undefined' ? historyData : [],
    genHistory: (typeof getGenHistory === 'function') ? getGenHistory() : [],
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ddinggok-history-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  if (typeof toast === 'function') toast('📦 히스토리 내보내기 완료!', 'ok', 2000);
}

function importHistory() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var data = JSON.parse(ev.target.result);
        if (!data.tracks || !Array.isArray(data.tracks)) throw new Error('잘못된 형식');

        var existingIds = {};
        if (typeof historyData !== 'undefined') {
          historyData.forEach(function (h) { if (h.id) existingIds[h.id] = true; });
        }

        var added = 0;
        data.tracks.forEach(function (t) {
          if (t.id && !existingIds[t.id]) {
            historyData.push(t);
            existingIds[t.id] = true;
            added++;
          }
        });

        /* 시간순 정렬 */
        historyData.sort(function (a, b) { return (b.created || 0) - (a.created || 0); });

        if (typeof saveHistory === 'function') saveHistory();
        if (typeof updateHistBadge === 'function') updateHistBadge();
        if (typeof renderHistoryView === 'function') renderHistoryView();
        if (typeof toast === 'function') toast('📥 ' + added + '곡 가져오기 완료!', 'ok', 3000);
      } catch (err) {
        if (typeof toast === 'function') toast('❌ 가져오기 실패: ' + err.message, 'err', 3000);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

/* ── 검색바 UI 렌더링 (히스토리 뷰 상단) ── */
function renderHistSearchBar() {
  var container = document.getElementById('hist-search-bar');
  if (!container) return;
  container.innerHTML =
    '<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">' +
    '<input type="search" id="hist-search-input" placeholder="제목, 태그 검색..." style="flex:1;min-width:120px;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--t1);font-size:12px;font-family:inherit;" oninput="histSearch(this.value)">' +
    '<select style="padding:6px 8px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--t2);font-size:11px;" onchange="histFilterDate(this.value)">' +
    '<option value="">전체 기간</option><option value="today">오늘</option><option value="week">이번 주</option><option value="month">이번 달</option></select>' +
    '<select style="padding:6px 8px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--t2);font-size:11px;" onchange="histFilterMode(this.value)">' +
    '<option value="">모든 모드</option><option value="custom">커스텀</option><option value="simple">심플</option><option value="youtube">YouTube</option><option value="extend">연장</option><option value="vocal-removal">보컬분리</option></select>' +
    '</div>' +
    '<div style="display:flex;gap:6px;margin-bottom:8px;">' +
    '<button onclick="exportHistory()" style="padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--t2);font-size:11px;cursor:pointer;">📦 내보내기</button>' +
    '<button onclick="importHistory()" style="padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--t2);font-size:11px;cursor:pointer;">📥 가져오기</button>' +
    '<button onclick="renderHistStats(typeof historyData!==\'undefined\'?historyData:[])" style="padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--t2);font-size:11px;cursor:pointer;">📊 통계</button>' +
    '</div>' +
    '<div id="hist-stats-panel"></div>';
}
