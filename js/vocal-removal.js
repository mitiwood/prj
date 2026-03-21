/* ── 보컬 제거 / 스템 분리 ── */
let _vrSourceIdx = -1, _vrMode = 'separate_vocal';
function _closeVR() { $('vocal-remove-modal').classList.remove('on'); }

document.querySelectorAll('.vr-mode-btn').forEach(b => b.addEventListener('click', () => {
  _vrMode = b.dataset.vrmode;
  document.querySelectorAll('.vr-mode-btn').forEach(x => {
    const on = x === b;
    x.style.background = on ? 'rgba(239,68,68,.08)' : 'var(--bg2)';
    x.style.borderColor = on ? '#ef4444' : 'var(--border)';
    x.style.color = on ? '#ef4444' : 'var(--t2)';
  });
  $('vr-stem-desc').style.display = _vrMode === 'split_stem' ? 'block' : 'none';
  $('vr-btn-txt').textContent = _vrMode === 'split_stem' ? '🎚 스템 분리 시작' : '🎤 보컬 제거 시작';
}));

$('hes-vocal-remove-btn').addEventListener('click', () => {
  if (_hesIdx < 0) return;
  const h = historyData[_hesIdx]; if (!h) return;
  _vrSourceIdx = _hesIdx;
  $('vr-thumb').innerHTML = h.image_url
    ? '<img src="' + esc(h.image_url) + '" alt="" style="width:100%;height:100%;object-fit:cover;">'
    : '🎵';
  $('vr-title').textContent = h.title || '무제';
  $('vr-tags').textContent = (h.tags || '').split(',').slice(0, 2).join(', ') || '';
  _vrMode = 'separate_vocal';
  document.querySelectorAll('.vr-mode-btn').forEach(x => {
    const v = x.dataset.vrmode === 'separate_vocal';
    x.style.background = v ? 'rgba(239,68,68,.08)' : 'var(--bg2)';
    x.style.borderColor = v ? '#ef4444' : 'var(--border)';
    x.style.color = v ? '#ef4444' : 'var(--t2)';
  });
  $('vr-stem-desc').style.display = 'none';
  $('vr-btn-txt').textContent = '🎤 보컬 제거 시작';
  closeHistEditSheet();
  $('vocal-remove-modal').classList.add('on');
});

$('vr-backdrop').addEventListener('click', _closeVR);

$('vr-submit-btn').addEventListener('click', async () => {
  if (_vrSourceIdx < 0) return;
  const h = historyData[_vrSourceIdx]; if (!h) return;
  if (currentUser?.provider === 'guest') {
    toast('보컬 제거는 로그인 후 이용할 수 있어요', 'err', 3000);
    _closeVR(); openLoginSheet(); return;
  }
  const apiKey = kieApiKey;
  if (!apiKey) { toast('API 키 로딩 중...', 'err'); return; }
  const tId = h.taskId || h.id, aId = h.id;
  if (!tId || !aId) { toast('트랙 ID 없음', 'err'); return; }

  $('vr-submit-btn').disabled = true;
  $('vr-spinner').style.display = 'block';
  $('vr-btn-txt').textContent = _vrMode === 'split_stem' ? '스템 분리 중...' : '보컬 제거 중...';

  try {
    const d = await kieRequest(apiKey, 'POST', '/api/v1/vocal-removal/generate', {
      taskId: tId, audioId: aId, type: _vrMode, callBackUrl: CALLBACK
    });
    const vrTid = d?.data?.taskId || d?.taskId;
    if (!vrTid) throw new Error('taskId 없음');

    _closeVR();
    switchTab('create-view');
    $('loading-card').classList.add('on');
    $('results').innerHTML = '';
    const fl = $('ld-fill');
    fl.style.animation = 'none'; void fl.offsetWidth; fl.style.animation = '';
    $('ld-sub').textContent = _vrMode === 'split_stem'
      ? '12트랙 스템 분리 중~ 잠깐이면 돼요 🎚'
      : '보컬이랑 반주 분리하는 중이에요 🎤';
    setTimeout(() => $('loading-card').scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);

    /* 폴링 */
    let res = null;
    for (let i = 0; i < 50; i++) {
      await sleep(i < 5 ? 2000 : i < 15 ? 3000 : 4000);
      try {
        const r = await kieRequest(apiKey, 'GET', '/api/v1/vocal-removal/record-info?taskId=' + vrTid);
        const s = r?.data; if (!s) continue;
        if (s.successFlag === 'SUCCESS') { res = s.response; break; }
        if (s.successFlag === 'CREATE_TASK_FAILED' || s.successFlag === 'GENERATE_AUDIO_FAILED')
          throw new Error('분리 실패');
        $('ld-sub').textContent = i < 8 ? 'AI가 오디오 분석 중 🔍'
          : i < 20 ? '보컬 패턴 찾는 중 🎶'
          : i < 35 ? '트랙 분리 거의 끝나가요 🎚'
          : '마무리 중~ 곧 나와요 ✨';
      } catch (pe) { if (pe.message.includes('실패')) throw pe; }
    }

    $('loading-card').classList.remove('on');
    if (!res) throw new Error('시간 초과');

    /* 결과 렌더링 */
    const vu = res.vocalUrl || '', iu = res.instrumentalUrl || '';
    const ti = esc(h.title || 'track');
    let htm = '<div style="padding:16px;">';
    htm += '<div style="font-size:16px;font-weight:800;color:var(--t1);margin-bottom:12px;">'
      + (_vrMode === 'split_stem' ? '🎚 스템 분리 완료!' : '🎤 보컬 제거 완료!') + '</div>';

    if (_vrMode === 'separate_vocal') {
      if (vu) htm += '<div style="margin-bottom:12px;padding:14px;background:var(--card);border:1px solid var(--border);border-radius:12px;">'
        + '<div style="font-size:13px;font-weight:700;color:var(--t1);margin-bottom:8px;">🎤 보컬</div>'
        + '<audio controls src="' + esc(vu) + '" style="width:100%;border-radius:8px;margin-bottom:8px;"></audio>'
        + '<button onclick="downloadFile(\'' + esc(vu) + '\',\'' + ti + '_Vocal.mp3\')" style="padding:8px 16px;border-radius:8px;border:none;background:var(--acc);color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">다운로드</button></div>';
      if (iu) htm += '<div style="padding:14px;background:var(--card);border:1px solid var(--border);border-radius:12px;">'
        + '<div style="font-size:13px;font-weight:700;color:var(--t1);margin-bottom:8px;">🎵 반주 (MR)</div>'
        + '<audio controls src="' + esc(iu) + '" style="width:100%;border-radius:8px;margin-bottom:8px;"></audio>'
        + '<button onclick="downloadFile(\'' + esc(iu) + '\',\'' + ti + '_MR.mp3\')" style="padding:8px 16px;border-radius:8px;border:none;background:var(--acc);color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">다운로드</button></div>';
    } else {
      /* 스템 분리 — 최대 14트랙 */
      var stems = [
        { k: 'vocalUrl', l: '🎤 보컬', n: 'Vocal' },
        { k: 'backingVocalsUrl', l: '🎵 백킹보컬', n: 'BVocal' },
        { k: 'drumsUrl', l: '🥁 드럼', n: 'Drums' },
        { k: 'bassUrl', l: '🎸 베이스', n: 'Bass' },
        { k: 'guitarUrl', l: '🎸 기타', n: 'Guitar' },
        { k: 'pianoUrl', l: '🎹 피아노', n: 'Piano' },
        { k: 'keyboardUrl', l: '🎹 키보드', n: 'Keys' },
        { k: 'percussionUrl', l: '🪘 퍼커션', n: 'Perc' },
        { k: 'stringsUrl', l: '🎻 스트링', n: 'Strings' },
        { k: 'synthUrl', l: '🎛 신스', n: 'Synth' },
        { k: 'brassUrl', l: '🎺 브라스', n: 'Brass' },
        { k: 'woodwindsUrl', l: '🎷 우드윈드', n: 'Winds' },
        { k: 'fxUrl', l: '✨ FX', n: 'FX' },
        { k: 'instrumentalUrl', l: '🎵 MR', n: 'MR' },
      ];
      stems.forEach(s => {
        const u = res[s.k]; if (!u) return;
        htm += '<div style="margin-bottom:8px;padding:12px;background:var(--card);border:1px solid var(--border);border-radius:10px;">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">'
          + '<span style="font-size:12px;font-weight:700;color:var(--t1);">' + s.l + '</span>'
          + '<button onclick="downloadFile(\'' + esc(u) + '\',\'' + ti + '_' + s.n + '.mp3\')" style="padding:5px 12px;border-radius:6px;border:none;background:var(--acc);color:#fff;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">다운로드</button>'
          + '</div><audio controls src="' + esc(u) + '" style="width:100%;height:32px;border-radius:6px;"></audio></div>';
      });
    }

    htm += '</div>';
    $('results').innerHTML = htm;
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });

    /* MR을 히스토리에 저장 */
    if (iu) {
      historyData.unshift({
        id: Date.now().toString(), taskId: vrTid,
        title: '[MR] ' + (h.title || '무제'),
        audio_url: iu, video_url: '', image_url: h.image_url || '',
        tags: 'instrumental, MR', lyrics: '', created: Date.now(),
        type: 'audio', genMode: 'vocal-removal',
        _vocalRemovedFrom: h.id || '',
        _owner: currentUser
          ? { name: currentUser.name, avatar: currentUser.avatar, provider: currentUser.provider }
          : null,
      });
      historyData = historyData.slice(0, 30);
      saveHistory(); updateHistBadge();
    }
    toast(_vrMode === 'split_stem' ? '스템 분리 완료!' : '보컬 제거 완료! MR이 저장됐어요', 'ok', 3000);
  } catch (e) {
    $('loading-card').classList.remove('on');
    toast('보컬 제거 실패: ' + e.message, 'err', 4000);
  } finally {
    $('vr-submit-btn').disabled = false;
    $('vr-spinner').style.display = 'none';
    $('vr-btn-txt').textContent = _vrMode === 'split_stem' ? '🎚 스템 분리 시작' : '🎤 보컬 제거 시작';
  }
});
