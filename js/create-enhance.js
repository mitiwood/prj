/* ======================================================
   create-enhance.js - 음악 만들기 고도화 (v2)
   1. 프리셋 시스템   2. 장르/무드 UI   3. 프롬프트 빌더
   4. 생성 진행 UX    5. 결과 카드      6. 심플모드 AI
   7. 고급 설정 (믹싱/마스터링/EQ)
   ====================================================== */

/* -- 1. 프리셋 시스템 고도화 -- */
const PRESET_CATEGORIES = {
  popular: { label: '인기', icon: '🔥', presets: ['kpop_girl','kpop_boy','ballad','hiphop','lofi'] },
  dance:   { label: '댄스/일렉', icon: '💃', presets: ['edm','future_bass','house','techno','synthwave'] },
  vocal:   { label: '보컬', icon: '🎤', presets: ['rnb','soul','ballad_m','trot','musical'] },
  inst:    { label: '연주', icon: '🎸', presets: ['jazz','classical','acoustic','ambient','piano_solo'] },
  mood:    { label: '분위기', icon: '✨', presets: ['cinematic','lofi','dreamy','dark_trap','retro_city'] },
};

const PRESETS_V2 = {
  kpop_girl:  { genre:'pop', sub:'K-Pop Dance', mood:'energetic, hype', bpm:128, instruments:['Synth','Bass'], vocal:'f', desc:'K-Pop girl group, catchy hook, bright synths, dance beat', icon:'🎀', label:'K-Pop 걸그룹' },
  kpop_boy:   { genre:'pop', sub:'K-Pop Dance', mood:'energetic, hype', bpm:125, instruments:['Synth','Bass','Drums'], vocal:'m', desc:'K-Pop boy group, powerful dance track, hard-hitting', icon:'🕺', label:'K-Pop 보이그룹' },
  ballad:     { genre:'pop', sub:'Ballad', mood:'sad, emotional', bpm:72, instruments:['Piano','Violin'], vocal:'f', desc:'Korean ballad, emotional vocal, piano-driven, heartfelt', icon:'🎹', label:'감성 발라드' },
  ballad_m:   { genre:'pop', sub:'Ballad', mood:'sad, emotional', bpm:68, instruments:['Piano','Guitar'], vocal:'m', desc:'Male vocal ballad, deep emotion, acoustic warmth', icon:'🎵', label:'남성 발라드' },
  hiphop:     { genre:'hiphop', sub:'Trap', mood:'dark, intense', bpm:140, instruments:['808 Bass','Hi-Hat'], vocal:'m', desc:'trap beat, hard-hitting 808, dark atmosphere, heavy bass', icon:'🔥', label:'힙합 트랩' },
  lofi:       { genre:'lofi', sub:'Lo-Fi Hip Hop', mood:'chill, lofi', bpm:85, instruments:['Piano','Guitar'], vocal:'', desc:'lo-fi chill, vinyl crackle, jazzy chords, study beats', inst:true, icon:'☕', label:'로파이 칠' },
  edm:        { genre:'electronic', sub:'Future Bass', mood:'energetic, hype', bpm:150, instruments:['Synth','Bass','Drums'], vocal:'', desc:'EDM drop, festival energy, massive build-up', inst:true, icon:'⚡', label:'EDM 클럽' },
  future_bass:{ genre:'electronic', sub:'Future Bass', mood:'hopeful, inspiring', bpm:140, instruments:['Synth','Piano'], vocal:'f', desc:'future bass, emotional drop, bright supersaw', icon:'🌈', label:'퓨처 베이스' },
  house:      { genre:'electronic', sub:'House', mood:'energetic, hype', bpm:126, instruments:['Synth','Bass'], vocal:'', desc:'deep house, groovy baseline, four-on-the-floor', inst:true, icon:'🏠', label:'하우스' },
  techno:     { genre:'electronic', sub:'Techno', mood:'dark, intense', bpm:135, instruments:['Synth','Drums'], vocal:'', desc:'dark techno, industrial, driving rhythm, hypnotic', inst:true, icon:'🔊', label:'테크노' },
  synthwave:  { genre:'electronic', sub:'Synthwave', mood:'nostalgic, retro', bpm:118, instruments:['Synth','Bass'], vocal:'', desc:'synthwave, 80s retro, neon lights, analog synth', inst:true, icon:'🌃', label:'신스웨이브' },
  rnb:        { genre:'pop', sub:'R&B', mood:'romantic, dreamy', bpm:90, instruments:['Piano','Bass'], vocal:'m', desc:'smooth R&B, soulful vocal, groove, late night vibes', icon:'💜', label:'R&B 소울' },
  soul:       { genre:'pop', sub:'R&B', mood:'hopeful, inspiring', bpm:95, instruments:['Piano','Guitar','Bass'], vocal:'f', desc:'neo-soul, warm vocal, organic grooves', icon:'💛', label:'네오소울' },
  trot:       { genre:'pop', sub:'Trot', mood:'happy, uplifting', bpm:130, instruments:['Guitar','Drums'], vocal:'m', desc:'modern trot, upbeat, catchy melody, Korean traditional pop', icon:'🎊', label:'트로트' },
  musical:    { genre:'pop', sub:'Musical', mood:'epic, cinematic', bpm:110, instruments:['Piano','Violin','Choir'], vocal:'f', desc:'musical theater, dramatic vocal, Broadway style', icon:'🎭', label:'뮤지컬' },
  jazz:       { genre:'jazz', sub:'Jazz', mood:'chill, lofi', bpm:110, instruments:['Piano','Saxophone','Bass'], vocal:'', desc:'jazz lounge, smooth saxophone, walking bass, cocktail', inst:true, icon:'🎷', label:'재즈 라운지' },
  classical:  { genre:'classical', sub:'Cinematic', mood:'epic, cinematic', bpm:100, instruments:['Violin','Piano','Choir'], vocal:'', desc:'cinematic orchestral, epic build, emotional crescendo', inst:true, icon:'🎻', label:'클래식/시네마틱' },
  acoustic:   { genre:'acoustic', sub:'Acoustic Pop', mood:'calm, relaxing', bpm:100, instruments:['Guitar'], vocal:'f', desc:'acoustic folk, warm vocal, fingerpicking guitar', icon:'🪕', label:'어쿠스틱' },
  ambient:    { genre:'lofi', sub:'Ambient', mood:'calm, relaxing', bpm:70, instruments:['Synth','Piano'], vocal:'', desc:'ambient soundscape, ethereal pads, meditation', inst:true, icon:'🌊', label:'앰비언트' },
  piano_solo: { genre:'classical', sub:'Piano Solo', mood:'calm, relaxing', bpm:80, instruments:['Piano'], vocal:'', desc:'solo piano, minimalist, emotional, Chopin-inspired', inst:true, icon:'🎹', label:'피아노 솔로' },
  dreamy:     { genre:'pop', sub:'Dream Pop', mood:'romantic, dreamy', bpm:105, instruments:['Synth','Guitar'], vocal:'f', desc:'dream pop, shoegaze, reverb-heavy, ethereal vocals', icon:'🌙', label:'드림팝' },
  dark_trap:  { genre:'hiphop', sub:'Dark Trap', mood:'dark, intense', bpm:145, instruments:['808 Bass','Synth'], vocal:'m', desc:'dark trap, haunting melodies, aggressive flow', icon:'🖤', label:'다크 트랩' },
  retro_city: { genre:'pop', sub:'City Pop', mood:'nostalgic, retro', bpm:115, instruments:['Synth','Bass','Guitar'], vocal:'f', desc:'city pop, 80s Japanese influence, funky grooves, neon', icon:'🏙', label:'시티팝' },
  rock:       { genre:'rock', sub:'Indie Rock', mood:'energetic, hype', bpm:120, instruments:['Guitar','Drums','Bass'], vocal:'m', desc:'indie rock, driving guitar, anthemic chorus', icon:'🎸', label:'인디 록' },
  cinematic:  { genre:'classical', sub:'Cinematic', mood:'epic, cinematic', bpm:95, instruments:['Violin','Piano','Choir'], vocal:'', desc:'film score, trailer music, epic orchestral, heroic', inst:true, icon:'🎬', label:'시네마틱' },
};

/* 최근 사용 프리셋 */
function _getRecentPresets(){ try{ return JSON.parse(localStorage.getItem('kms_recent_presets')||'[]'); }catch{return [];} }
function _saveRecentPreset(key){
  let recent = _getRecentPresets().filter(k=>k!==key);
  recent.unshift(key);
  if(recent.length>5) recent=recent.slice(0,5);
  try{ localStorage.setItem('kms_recent_presets',JSON.stringify(recent)); }catch{}
}

/* 커스텀 프리셋 저장/불러오기 */
function _getCustomPresets(){ try{ return JSON.parse(localStorage.getItem('kms_custom_presets')||'{}'); }catch{return {};} }
function _saveCustomPreset(name){
  const presets = _getCustomPresets();
  presets[name] = {
    genre: document.getElementById('genre-cat')?.value||'',
    sub: document.getElementById('genre-sub')?.value||'',
    mood: document.getElementById('mood')?.value||'',
    bpm: parseInt(document.getElementById('bpm-slider')?.value)||120,
    instruments: typeof selectedInstruments!=='undefined'?[...selectedInstruments]:[],
    vocal: typeof vocalGender!=='undefined'?vocalGender:'',
    desc: document.getElementById('song-desc')?.value||'',
    inst: typeof instOn!=='undefined'?instOn:false,
    model: document.getElementById('model-sel')?.value||'V4_5',
    sw: parseFloat(document.getElementById('style-weight')?.value)||0.65,
    wc: parseFloat(document.getElementById('weird-constraint')?.value)||0.65,
    neg: document.getElementById('neg-tags')?.value||'',
    label: name, icon:'💾',
    savedAt: Date.now()
  };
  try{ localStorage.setItem('kms_custom_presets',JSON.stringify(presets)); }catch{}
  toast('💾 "'+name+'" 프리셋 저장 완료!','ok',2000);
  _renderPresetCarousel();
}
function _deleteCustomPreset(name){
  const presets=_getCustomPresets(); delete presets[name];
  try{ localStorage.setItem('kms_custom_presets',JSON.stringify(presets)); }catch{}
  _renderPresetCarousel();
}

/* 프리셋 캐러셀 렌더 */
function _renderPresetCarousel(){
  const wrap=document.getElementById('preset-carousel');
  if(!wrap) return;
  const recent=_getRecentPresets();
  const custom=_getCustomPresets();
  let html='<div class="preset-scroll">';

  /* 최근 사용 */
  if(recent.length){
    html+='<div class="preset-cat-label">최근</div>';
    recent.forEach(k=>{
      const p=PRESETS_V2[k]||custom[k];
      if(p) html+=_presetChipHtml(k,p,true);
    });
    html+='<div class="preset-divider"></div>';
  }

  /* 커스텀 프리셋 */
  const customKeys=Object.keys(custom);
  if(customKeys.length){
    html+='<div class="preset-cat-label">내 프리셋</div>';
    customKeys.forEach(k=>{
      html+=_presetChipHtml(k,custom[k],false,true);
    });
    html+='<div class="preset-divider"></div>';
  }

  /* 카테고리별 */
  Object.values(PRESET_CATEGORIES).forEach(cat=>{
    html+='<div class="preset-cat-label">'+cat.icon+' '+cat.label+'</div>';
    cat.presets.forEach(k=>{
      const p=PRESETS_V2[k]; if(p) html+=_presetChipHtml(k,p);
    });
  });

  /* 저장 버튼 */
  html+='<button class="preset-chip preset-save-btn" onclick="_showSavePresetDialog()">＋ 저장</button>';
  html+='</div>';
  wrap.innerHTML=html;
}

function _presetChipHtml(key,p,isRecent,isCustom){
  const cls=isRecent?'preset-chip recent':'preset-chip';
  const safeKey = String(key).replace(/'/g, "\\'").replace(/"/g, '\\"');
  const del=isCustom?` <span class="preset-del" onclick="event.stopPropagation();_deleteCustomPreset('${safeKey}')">✕</span>`:'';
  const safeDesc = _esc(p.desc||p.label||'');
  const safeLabel = _esc(p.label||key);
  return `<button class="${cls}" onclick="_applyPresetV2('${safeKey}')" title="${safeDesc}">${p.icon||'🎵'} ${safeLabel}${del}</button>`;
}

function _applyPresetV2(key){
  const p = PRESETS_V2[key] || _getCustomPresets()[key];
  if(!p) return;
  _saveRecentPreset(key);

  /* 커스텀 모드로 전환 */
  const customTab=document.querySelector('.mtab[data-mode="custom"]');
  if(customTab) customTab.click();

  setTimeout(()=>{
    /* 장르 */
    if(p.genre){
      const genreBtn=document.querySelector('.genre-btn[data-cat="'+p.genre+'"]');
      if(genreBtn) genreBtn.click();
      setTimeout(()=>{
        if(p.sub){ const s=document.getElementById('genre-sub'); if(s){s.value=p.sub;s.dispatchEvent(new Event('change'));} }
      },100);
    }
    /* 무드 */
    const moodSel=document.getElementById('mood');
    if(moodSel && p.mood){
      /* 정확히 일치하는 옵션 찾기 */
      const opts=Array.from(moodSel.options);
      const match=opts.find(o=>o.value===p.mood) || opts.find(o=>p.mood.includes(o.value.split(',')[0].trim()));
      if(match) moodSel.value=match.value;
    }
    /* BPM */
    if(p.bpm){
      const slider=document.getElementById('bpm-slider');
      if(slider){slider.value=p.bpm;slider.dispatchEvent(new Event('input'));if(typeof bpmAuto!=='undefined')bpmAuto=false;}
    }
    /* 곡 설명 */
    if(p.desc){const d=document.getElementById('song-desc');if(d)d.value=p.desc;}
    /* 인스트루멘탈 */
    if(typeof instOn!=='undefined'){
      instOn=!!p.inst;
      const it=document.getElementById('inst-toggle');
      if(it){if(instOn)it.classList.add('on');else it.classList.remove('on');}
    }
    /* 보컬 */
    if(p.vocal&&typeof vocalGender!=='undefined'){
      vocalGender=p.vocal;
      document.querySelectorAll('.vbtn').forEach(b=>{b.classList.toggle('on',b.dataset.v===(p.vocal||''));});
    }
    /* 악기 */
    if(p.instruments&&typeof selectedInstruments!=='undefined'){
      selectedInstruments=p.instruments;
      document.querySelectorAll('.adv-inst-btn').forEach(b=>{
        const name=b.dataset.inst||b.textContent.trim();
        b.classList.toggle('on',selectedInstruments.some(i=>name.toLowerCase().includes(i.toLowerCase())));
      });
    }
    /* 고급 설정 */
    if(p.model){const m=document.getElementById('model-sel');if(m)m.value=p.model;}
    if(p.sw!=null){const s=document.getElementById('style-weight');if(s){s.value=p.sw;s.dispatchEvent(new Event('input'));}}
    if(p.wc!=null){const w=document.getElementById('weird-constraint');if(w){w.value=p.wc;w.dispatchEvent(new Event('input'));}}
    if(p.neg){const n=document.getElementById('neg-tags');if(n)n.value=p.neg;}

    /* 프롬프트 미리보기 + 분위기 그리드 동기화 */
    _updatePromptPreview();
    if(typeof _syncMoodGrid==='function') _syncMoodGrid();
    /* 프리셋 칩 하이라이트 */
    document.querySelectorAll('.preset-chip').forEach(c=>c.classList.remove('active'));
    const activeChip=document.querySelector('.preset-chip[onclick*="'+key+'"]');
    if(activeChip) activeChip.classList.add('active');

    toast('✨ "'+((p.label||key).replace(/[^\w가-힣 ]/g,'').trim())+'" 프리셋 적용!','ok',2000);
  },60);
}

function _showSavePresetDialog(){
  const name=prompt('프리셋 이름을 입력하세요:');
  if(!name||!name.trim()) return;
  _saveCustomPreset(name.trim());
}

/* -- 3. 실시간 프롬프트 미리보기 -- */
function _updatePromptPreview(){
  const wrap=document.getElementById('prompt-preview-panel');
  if(!wrap) return;
  const genre=document.getElementById('genre-sub')?.value||document.getElementById('genre-cat')?.value||'';
  const mood=document.getElementById('mood')?.value||'';
  const desc=document.getElementById('song-desc')?.value||'';
  const bpm=document.getElementById('bpm-slider')?.value||'';
  const insts=(typeof selectedInstruments!=='undefined'?selectedInstruments:[]).join(', ');
  const ref=document.getElementById('ref-artist')?.value||'';
  const lang=document.getElementById('lyrics-lang')?.value||'';
  const sw=parseFloat(document.getElementById('style-weight')?.value||0.65);
  const wc=parseFloat(document.getElementById('weird-constraint')?.value||0.65);

  const tags=[];
  if(genre) tags.push({label:genre,type:'genre'});
  if(mood) tags.push({label:mood.split(',')[0].trim(),type:'mood'});
  if(desc) tags.push({label:desc.length>30?desc.slice(0,30)+'...':desc,type:'desc'});
  if(bpm && typeof bpmAuto!=='undefined' && !bpmAuto) tags.push({label:bpm+' BPM',type:'bpm'});
  if(insts) tags.push({label:insts,type:'inst'});
  if(ref) tags.push({label:'ref: '+ref,type:'ref'});
  if(lang) tags.push({label:lang,type:'lang'});

  if(!tags.length){
    wrap.style.display='none';
    return;
  }
  wrap.style.display='block';

  /* 품질 점수 */
  let score=0;
  if(genre) score+=30;
  if(mood) score+=15;
  if(desc) score+=20;
  if(bpm && typeof bpmAuto!=='undefined' && !bpmAuto) score+=5;
  if(insts) score+=10;
  if(ref) score+=10;
  if(lang) score+=5;
  if(sw>0.7||sw<0.4) score+=3;
  if(wc>0.7||wc<0.4) score+=2;
  score=Math.min(score,100);

  const scoreColor=score>=70?'#22c55e':score>=40?'#f59e0b':'#ef4444';
  const scoreLabel=score>=70?'최적':'보통';

  let html='<div class="pp-header"><span class="pp-title">프롬프트 미리보기</span>';
  html+='<span class="pp-score" style="color:'+scoreColor+'">'+scoreLabel+' '+score+'점</span></div>';
  html+='<div class="pp-tags">';
  tags.forEach(t=>{
    html+='<span class="pp-tag pp-tag-'+t.type+'">'+_esc(t.label)+'</span>';
  });
  html+='</div>';
  /* 프로그레스 바 */
  html+='<div class="pp-bar"><div class="pp-bar-fill" style="width:'+score+'%;background:'+scoreColor+';"></div></div>';
  wrap.innerHTML=html;

  /* 생성 요약 카드 업데이트 */
  var sumEl=document.getElementById('gen-summary-tags');
  if(sumEl){
    var vocal=(typeof vocalGender!=='undefined'&&vocalGender)?({m:'🧑 남성보컬',f:'👩 여성보컬'}[vocalGender]||''):'';
    var instOn_=(typeof instOn!=='undefined'&&instOn);
    var model_=document.getElementById('model-sel');
    var modelTxt=model_?model_.options[model_.selectedIndex]?.textContent||'':'';
    var sumTags=[];
    if(genre) sumTags.push('<span style="background:rgba(124,58,237,.2);color:#c4b5fd;padding:2px 8px;border-radius:6px;">'+_esc(genre)+'</span>');
    if(mood) sumTags.push('<span style="background:rgba(245,158,11,.15);color:#fcd34d;padding:2px 8px;border-radius:6px;">'+_esc(mood.split(',')[0].trim())+'</span>');
    if(bpm&&typeof bpmAuto!=='undefined'&&!bpmAuto) sumTags.push('<span style="background:rgba(59,130,246,.15);color:#93c5fd;padding:2px 8px;border-radius:6px;">'+bpm+' BPM</span>');
    if(instOn_) sumTags.push('<span style="background:rgba(34,197,94,.15);color:#86efac;padding:2px 8px;border-radius:6px;">🎹 인스트루멘탈</span>');
    else if(vocal) sumTags.push('<span style="background:rgba(244,114,182,.15);color:#f9a8d4;padding:2px 8px;border-radius:6px;">'+vocal+'</span>');
    if(insts) sumTags.push('<span style="background:rgba(255,255,255,.06);color:var(--t2);padding:2px 8px;border-radius:6px;">🎸 '+_esc(insts)+'</span>');
    if(modelTxt) sumTags.push('<span style="background:rgba(255,255,255,.06);color:var(--t3);padding:2px 8px;border-radius:6px;">'+_esc(modelTxt)+'</span>');
    sumEl.innerHTML=sumTags.length?sumTags.join(''):'<span style="color:var(--t3);">장르나 분위기를 선택하면 여기에 요약이 표시됩니다</span>';
    document.getElementById('gen-summary-card').style.display=sumTags.length?'':'none';
  }
}

function _esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

/* -- 4. 생성 진행 UX 개선 -- */
const GEN_STEPS=[
  {label:'요청 전송',icon:'📡',duration:3},
  {label:'곡 구상',icon:'🧠',duration:12},
  {label:'멜로디 생성',icon:'🎹',duration:20},
  {label:'보컬 녹음',icon:'🎤',duration:25},
  {label:'편곡 & 믹싱',icon:'🎚',duration:20},
  {label:'마스터링',icon:'✨',duration:10},
];
let _genStartTime=0;
let _genStepTimer=null;

function _startGenProgress(){
  _genStartTime=Date.now();
  const wrap=document.getElementById('gen-progress-steps');
  if(!wrap) return;
  wrap.style.display='block';
  let html='<div class="gp-steps">';
  GEN_STEPS.forEach((s,i)=>{
    html+='<div class="gp-step" id="gp-step-'+i+'"><span class="gp-step-icon">'+s.icon+'</span><span class="gp-step-label">'+s.label+'</span><span class="gp-step-status" id="gp-status-'+i+'">대기</span></div>';
  });
  html+='</div>';
  html+='<div class="gp-eta" id="gp-eta">예상 시간: ~90초</div>';
  wrap.innerHTML=html;

  let stepIdx=0;
  let elapsed=0;
  _activateStep(0);

  _genStepTimer=setInterval(()=>{
    elapsed=Math.floor((Date.now()-_genStartTime)/1000);
    const remain=Math.max(0,90-elapsed);
    const etaEl=document.getElementById('gp-eta');
    if(etaEl) etaEl.textContent=remain>0?'남은 시간: ~'+remain+'초':'거의 완료!';

    /* 단계 진행 */
    let cumulative=0;
    for(let i=0;i<GEN_STEPS.length;i++){
      cumulative+=GEN_STEPS[i].duration;
      if(elapsed>=cumulative && i>stepIdx){
        _completeStep(stepIdx);
        stepIdx=i;
        _activateStep(stepIdx);
      }
    }
  },1000);
}

function _activateStep(idx){
  const el=document.getElementById('gp-step-'+idx);
  const st=document.getElementById('gp-status-'+idx);
  if(el) el.classList.add('active');
  if(st) st.textContent='진행 중...';
}
function _completeStep(idx){
  const el=document.getElementById('gp-step-'+idx);
  const st=document.getElementById('gp-status-'+idx);
  if(el){el.classList.remove('active');el.classList.add('done');}
  if(st) st.textContent='완료 ✓';
}
function _stopGenProgress(){
  if(_genStepTimer){clearInterval(_genStepTimer);_genStepTimer=null;}
  /* 모든 단계 완료 처리 */
  GEN_STEPS.forEach((_,i)=>_completeStep(i));
  setTimeout(()=>{
    const wrap=document.getElementById('gen-progress-steps');
    if(wrap) wrap.style.display='none';
  },2000);
}

/* -- 6. 심플모드 AI 대화형 - 자연어 -> 설정 매핑 -- */
const _NLP_GENRE_MAP = {
  '케이팝':'pop','k-pop':'pop','kpop':'pop','팝':'pop','발라드':'pop','ballad':'pop',
  '힙합':'hiphop','hip hop':'hiphop','hiphop':'hiphop','랩':'hiphop','rap':'hiphop','트랩':'hiphop','trap':'hiphop',
  '일렉':'electronic','edm':'electronic','electronic':'electronic','하우스':'electronic','house':'electronic','테크노':'electronic',
  '록':'rock','rock':'rock','인디':'rock','indie':'rock','펑크':'rock','punk':'rock',
  '로파이':'lofi','lofi':'lofi','lo-fi':'lofi','칠':'lofi','chill':'lofi',
  '재즈':'jazz','jazz':'jazz','보사노바':'jazz','bossa nova':'jazz',
  '클래식':'classical','classical':'classical','오케스트라':'classical','orchestral':'classical',
  '어쿠스틱':'acoustic','acoustic':'acoustic','포크':'acoustic','folk':'acoustic',
  '알앤비':'pop','r&b':'pop','rnb':'pop','소울':'pop','soul':'pop',
  '트로트':'pop','trot':'pop',
};
const _NLP_MOOD_MAP = {
  '신나는':'energetic, hype','밝은':'happy, uplifting','행복':'happy, uplifting','활기':'energetic, hype',
  '슬픈':'sad, emotional','감성':'sad, emotional','우울':'sad, emotional','센치':'sad, emotional',
  '잔잔':'calm, relaxing','편안':'calm, relaxing','차분':'calm, relaxing','평화':'calm, relaxing',
  '어두운':'dark, intense','강렬':'dark, intense','무거운':'dark, intense','하드':'aggressive, powerful',
  '로맨틱':'romantic, dreamy','몽환':'romantic, dreamy','달콤':'romantic, dreamy','사랑':'romantic, dreamy',
  '웅장':'epic, cinematic','영화':'epic, cinematic','epic':'epic, cinematic','시네마틱':'epic, cinematic',
  '에너지':'energetic, hype','파워':'aggressive, powerful','격한':'aggressive, powerful',
  '복고':'nostalgic, retro','레트로':'nostalgic, retro','80년대':'nostalgic, retro','90년대':'nostalgic, retro',
  '칠':'chill, lofi','릴렉스':'calm, relaxing','비':'calm, relaxing','카페':'chill, lofi',
  '희망':'hopeful, inspiring','영감':'hopeful, inspiring',
  '신비':'mysterious, ethereal','미스터리':'mysterious, ethereal',
};
const _NLP_TEMPO_MAP = {
  '빠른':140,'빠르게':140,'업비트':130,'upbeat':130,'fast':140,
  '느린':75,'느리게':75,'slow':75,'천천히':70,
  '보통':110,'미디엄':110,'medium':110,
};

function _parseNaturalLanguage(text){
  const lower=text.toLowerCase();
  const result={genre:'',sub:'',mood:'',bpm:0,vocal:'',inst:false,desc:text};

  /* 장르 매칭 */
  for(const [kw,genre] of Object.entries(_NLP_GENRE_MAP)){
    if(lower.includes(kw)){result.genre=genre;break;}
  }
  /* 무드 매칭 */
  for(const [kw,mood] of Object.entries(_NLP_MOOD_MAP)){
    if(lower.includes(kw)){result.mood=mood;break;}
  }
  /* 템포 */
  for(const [kw,bpm] of Object.entries(_NLP_TEMPO_MAP)){
    if(lower.includes(kw)){result.bpm=bpm;break;}
  }
  /* 보컬 */
  if(lower.includes('여성')||lower.includes('여자')||lower.includes('female')) result.vocal='f';
  else if(lower.includes('남성')||lower.includes('남자')||lower.includes('male')) result.vocal='m';
  /* 인스트루멘탈 */
  if(lower.includes('인스트')||lower.includes('연주')||lower.includes('instrumental')||lower.includes('bgm')) result.inst=true;

  return result;
}

/* 심플모드 AI 추천 예시 칩 */
const _SIMPLE_SUGGESTIONS=[
  '비 오는 날 카페에서 듣는 재즈',
  '새벽 감성 로파이 힙합',
  '에너지 넘치는 K-Pop 댄스곡',
  '드라이브할 때 듣는 신스웨이브',
  '감성 가득한 피아노 발라드',
  '운동할 때 듣는 힙합 트랩',
  '봄날 산책길 어쿠스틱 팝',
  '영화 같은 웅장한 오케스트라',
];

function _renderSimpleSuggestions(){
  const wrap=document.getElementById('simple-suggestions');
  if(!wrap) return;
  const shuffled=_SIMPLE_SUGGESTIONS.sort(()=>Math.random()-0.5).slice(0,4);
  wrap.innerHTML=shuffled.map(s=>'<button class="simple-sug-chip" onclick="_applySimpleSuggestion(this.textContent)">'+s+'</button>').join('');
}

function _applySimpleSuggestion(text){
  const input=document.getElementById('ai-assist-input')||document.getElementById('simple-prompt');
  if(input){input.value=text;input.dispatchEvent(new Event('input'));}
  /* 자동 파싱 & 적용 */
  const parsed=_parseNaturalLanguage(text);
  _applyParsedToSimple(parsed);
}

function _applyParsedToSimple(parsed){
  if(parsed.mood){
    const moodSel=document.getElementById('simple-mood');
    if(moodSel){
      const opts=Array.from(moodSel.options);
      const match=opts.find(o=>o.value===parsed.mood);
      if(match) moodSel.value=match.value;
    }
  }
  if(parsed.bpm){
    const slider=document.getElementById('simple-bpm-slider');
    if(slider){slider.value=parsed.bpm;slider.dispatchEvent(new Event('input'));}
  }
  if(parsed.inst){
    const toggle=document.getElementById('simple-inst-toggle');
    if(toggle&&!toggle.classList.contains('on')) toggle.click();
  }
  /* NLP 파싱 결과 표시 */
  const resultEl=document.getElementById('simple-nlp-result');
  if(resultEl){
    const tags=[];
    if(parsed.genre) tags.push('<span class="nlp-tag nlp-genre">'+_esc(_NLP_GENRE_MAP_REVERSE[parsed.genre]||parsed.genre)+'</span>');
    if(parsed.mood) tags.push('<span class="nlp-tag nlp-mood">'+_esc(parsed.mood.split(',')[0])+'</span>');
    if(parsed.bpm) tags.push('<span class="nlp-tag nlp-bpm">'+parsed.bpm+' BPM</span>');
    if(parsed.vocal) tags.push('<span class="nlp-tag nlp-vocal">'+(parsed.vocal==='f'?'여성':'남성')+' 보컬</span>');
    if(parsed.inst) tags.push('<span class="nlp-tag nlp-inst">인스트루멘탈</span>');
    if(tags.length){
      resultEl.innerHTML='<div class="nlp-parsed">AI가 파악한 설정: '+tags.join(' ')+'</div>';
      resultEl.style.display='block';
    } else {
      resultEl.style.display='none';
    }
  }
}

const _NLP_GENRE_MAP_REVERSE={pop:'팝',hiphop:'힙합',electronic:'일렉트로닉',rock:'록',lofi:'로파이',jazz:'재즈',classical:'클래식',acoustic:'어쿠스틱'};

/* -- 7. 고급 설정 - 믹싱/마스터링/EQ -- */
const MASTERING_PRESETS=[
  {id:'default',label:'🎵 기본',desc:'밸런스된 표준 마스터링',eq:{low:0,mid:0,high:0},comp:0.5,reverb:0.3},
  {id:'warm',label:'🔥 따뜻한',desc:'저음 강화, 아날로그 느낌',eq:{low:3,mid:0,high:-1},comp:0.6,reverb:0.35},
  {id:'bright',label:'✨ 밝은',desc:'고음 강화, 선명한 사운드',eq:{low:-1,mid:1,high:3},comp:0.4,reverb:0.25},
  {id:'bass',label:'🔊 베이스',desc:'베이스 부스트, 클럽 사운드',eq:{low:5,mid:-1,high:0},comp:0.7,reverb:0.2},
  {id:'vocal',label:'🎤 보컬',desc:'보컬 중심 믹싱',eq:{low:-2,mid:3,high:1},comp:0.5,reverb:0.4},
  {id:'airy',label:'🌊 공간감',desc:'넓은 스테레오, 리버브 강화',eq:{low:0,mid:-1,high:2},comp:0.3,reverb:0.7},
  {id:'punchy',label:'👊 펀치',desc:'어택 강화, 타이트한 믹스',eq:{low:2,mid:2,high:0},comp:0.8,reverb:0.15},
  {id:'lofi_master',label:'📻 로파이',desc:'빈티지 필터, 따뜻한 왜곡',eq:{low:1,mid:-2,high:-3},comp:0.4,reverb:0.5},
];

let _currentMasterPreset='default';
let _eqSettings={low:0,mid:0,high:0};
let _compAmount=0.5;
let _reverbAmount=0.3;
let _stereoWidth=0.5;

function _applyMasterPreset(id){
  const p=MASTERING_PRESETS.find(x=>x.id===id);if(!p) return;
  _currentMasterPreset=id;
  _eqSettings={...p.eq};
  _compAmount=p.comp;
  _reverbAmount=p.reverb;

  /* UI 업데이트 */
  const eqLow=document.getElementById('eq-low');if(eqLow){eqLow.value=p.eq.low;_updateEqLabel('low',p.eq.low);}
  const eqMid=document.getElementById('eq-mid');if(eqMid){eqMid.value=p.eq.mid;_updateEqLabel('mid',p.eq.mid);}
  const eqHigh=document.getElementById('eq-high');if(eqHigh){eqHigh.value=p.eq.high;_updateEqLabel('high',p.eq.high);}
  const comp=document.getElementById('mix-comp');if(comp){comp.value=p.comp;_updateMixLabel('comp',p.comp);}
  const rev=document.getElementById('mix-reverb');if(rev){rev.value=p.reverb;_updateMixLabel('reverb',p.reverb);}

  /* 버튼 활성화 */
  document.querySelectorAll('.master-preset-btn').forEach(b=>{
    b.classList.toggle('active',b.dataset.mid===id);
  });

  toast('🎧 "'+p.label.replace(/[^\w가-힣 ]/g,'')+'" 마스터링 적용','ok',1500);
}

function _updateEqLabel(band,val){
  const el=document.getElementById('eq-'+band+'-val');
  if(el) el.textContent=(val>0?'+':'')+val+'dB';
}
function _updateMixLabel(type,val){
  const el=document.getElementById('mix-'+type+'-val');
  if(el) el.textContent=Math.round(val*100)+'%';
}

function _getMixingTags(){
  /* EQ/믹싱 설정을 프롬프트 태그로 변환 */
  const tags=[];
  if(_eqSettings.low>=3) tags.push('bass-heavy');
  else if(_eqSettings.low<=-3) tags.push('thin bass');
  if(_eqSettings.high>=3) tags.push('bright, crisp');
  else if(_eqSettings.high<=-3) tags.push('warm, dark');
  if(_eqSettings.mid>=3) tags.push('vocal-forward');
  if(_compAmount>=0.7) tags.push('punchy, compressed');
  else if(_compAmount<=0.3) tags.push('dynamic, natural');
  if(_reverbAmount>=0.6) tags.push('spacious, reverb-heavy');
  else if(_reverbAmount<=0.2) tags.push('dry, tight');
  return tags.join(', ');
}

/* -- 초기화 -- */
function _initCreateEnhance(){
  _renderPresetCarousel();
  _renderSimpleSuggestions();

  /* 프롬프트 미리보기 — 입력 변경 감지 */
  ['genre-sub','mood','song-desc','bpm-slider','ref-artist','lyrics-lang','style-weight','weird-constraint'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){
      el.addEventListener('input',_updatePromptPreview);
      el.addEventListener('change',_updatePromptPreview);
    }
  });

  /* 심플모드 입력 → NLP 파싱 */
  const simpleInput=document.getElementById('simple-prompt');
  if(simpleInput){
    let _debounce;
    simpleInput.addEventListener('input',()=>{
      clearTimeout(_debounce);
      _debounce=setTimeout(()=>{
        const parsed=_parseNaturalLanguage(simpleInput.value);
        _applyParsedToSimple(parsed);
      },500);
    });
  }

  /* AI 어시스턴트 입력도 NLP */
  const aiInput=document.getElementById('ai-assist-input');
  if(aiInput){
    let _debounce2;
    aiInput.addEventListener('input',()=>{
      clearTimeout(_debounce2);
      _debounce2=setTimeout(()=>{
        const parsed=_parseNaturalLanguage(aiInput.value);
        _applyParsedToSimple(parsed);
      },500);
    });
  }
}

/* -- 5. 결과 카드 - 공유 기능 -- */
function commShareTrack(audioUrl,title){
  /* 커뮤니티에 공유 → 트랙이 이미 서버에 저장되어 있으므로 커뮤니티 탭으로 이동 */
  if(typeof switchTab==='function') switchTab('community-view');
  if(typeof toast==='function') toast('🌐 커뮤니티에서 공유된 곡을 확인하세요!','ok',2500);
}
function _copyShareLink(audioUrl,title){
  const text=title+' - AI Music Studio\n'+audioUrl;
  if(navigator.clipboard){
    navigator.clipboard.writeText(text).then(()=>{
      if(typeof toast==='function') toast('🔗 공유 링크 복사 완료!','ok',1500);
    });
  }
}
function _shareKakao(title,audioUrl){
  if(typeof Kakao!=='undefined'&&Kakao.isInitialized&&Kakao.isInitialized()){
    try{
      Kakao.Share.sendDefault({
        objectType:'feed',
        content:{title:title||'AI Music Studio',description:'AI로 만든 음악을 들어보세요!',imageUrl:'https://ai-music-studio-bice.vercel.app/icons/icon-512.png',link:{mobileWebUrl:audioUrl,webUrl:audioUrl}},
        buttons:[{title:'듣기',link:{mobileWebUrl:audioUrl,webUrl:audioUrl}}]
      });
    }catch(e){_copyShareLink(audioUrl,title);}
  } else {
    _copyShareLink(audioUrl,title);
  }
}

/* DOM Ready */
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>setTimeout(_initCreateEnhance,800));
} else {
  setTimeout(_initCreateEnhance,800);
}

/* 전역 노출 */
window._applyPresetV2=_applyPresetV2;
window._renderPresetCarousel=_renderPresetCarousel;
window._showSavePresetDialog=_showSavePresetDialog;
window._deleteCustomPreset=_deleteCustomPreset;
window._applySimpleSuggestion=_applySimpleSuggestion;
window._updatePromptPreview=_updatePromptPreview;
window._startGenProgress=_startGenProgress;
window._stopGenProgress=_stopGenProgress;
window._applyMasterPreset=_applyMasterPreset;
window._getMixingTags=_getMixingTags;
window._renderSimpleSuggestions=_renderSimpleSuggestions;
window._parseNaturalLanguage=_parseNaturalLanguage;
window.PRESETS_V2=PRESETS_V2;
window.commShareTrack=commShareTrack;
window._copyShareLink=_copyShareLink;
window._shareKakao=_shareKakao;
window._updateEqLabel=_updateEqLabel;
window._updateMixLabel=_updateMixLabel;
