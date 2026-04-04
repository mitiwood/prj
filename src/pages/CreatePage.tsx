import { motion, AnimatePresence } from 'framer-motion';
import { Music, Zap, Search, Loader2, Video, Play, Pause, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { useGenerate } from '../hooks/useGenerate';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { useStore } from '../stores/useStore';
import { ModelSelector } from '../components/generate/ModelSelector';
import { PresetGrid } from '../components/generate/PresetGrid';
import { AdvancedOptions } from '../components/generate/AdvancedOptions';
import { GenButton } from '../components/generate/GenButton';
import { getDefaultModel } from '../lib/engine/model-profiles';
import { buildStyleString } from '../lib/engine/prompt-engine';
import type { Preset } from '../lib/engine/presets';

const moodOptions = [
  { label: '편안한', emoji: '🌙', style: 'calm, relaxing, peaceful' },
  { label: '신나는', emoji: '🔥', style: 'upbeat, energetic, exciting' },
  { label: '감성적', emoji: '💜', style: 'emotional, sentimental, heartfelt' },
  { label: '몽환적', emoji: '✨', style: 'dreamy, ambient, ethereal' },
  { label: '파워풀', emoji: '💪', style: 'powerful, intense, strong' },
  { label: '로맨틱', emoji: '💕', style: 'romantic, sweet, lovely' },
];

const genreOptions = [
  { label: 'K-Pop', style: 'K-Pop' }, { label: '발라드', style: 'K-Ballad' },
  { label: '힙합', style: 'Hip-Hop, Rap' }, { label: 'R&B', style: 'R&B, Soul' },
  { label: 'EDM', style: 'Electronic, EDM' }, { label: 'Lo-fi', style: 'Lo-fi, Chill' },
  { label: '록', style: 'Rock, Band' }, { label: '재즈', style: 'Jazz' },
  { label: '팝', style: 'Pop' }, { label: '클래식', style: 'Classical, Orchestral' },
];

export function CreatePage() {
  const [activeMode, setActiveMode] = useState(0);
  const modes = ['커스��', '심플', 'YouTube', 'MV'];

  // Custom
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [model, setModel] = useState(() => getDefaultModel(false));
  const [instrumental, setInstrumental] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [vocal, setVocal] = useState('');
  const [negativeTags, setNegativeTags] = useState('');
  const [genre, setGenre] = useState('');
  const [mood, setMood] = useState('');

  // Simple
  const [simpleMood, setSimpleMood] = useState('');
  const [simpleGenre, setSimpleGenre] = useState('');
  const [simpleDesc, setSimpleDesc] = useState('');
  const [simpleStep, setSimpleStep] = useState(0);

  // YouTube
  const [ytUrl, setYtUrl] = useState('');
  const [ytAnalysis, setYtAnalysis] = useState<any>(null);
  const [ytAnalyzing, setYtAnalyzing] = useState(false);
  const [ytLyrics, setYtLyrics] = useState('');

  // MV
  const [mvTrackId, setMvTrackId] = useState('');

  const { generate } = useGenerate();
  const { play, currentTrack, isPlaying } = useAudioPlayer();
  const { user, history, isGenerating, isGuest, addToast } = useStore();

  const handlePresetSelect = (preset: Preset & { key: string }) => {
    setGenre(preset.sub || preset.genre);
    setMood(preset.mood);
    setBpm(preset.bpm);
    setVocal(preset.vocal);
    setInstrumental(!!preset.inst);
    setPrompt(preset.desc);
    addToast(`${preset.icon} ${preset.label} 프리셋 적용됨`, 'ok', 2000);
  };

  const handleCustomGenerate = async () => {
    if (!prompt.trim()) return;
    const style = buildStyleString({ genre, mood, bpm, vocal, negative: negativeTags });
    try {
      const track = await generate({
        prompt: prompt.trim(), title: title.trim() || undefined,
        style: style || undefined, instrumental, model,
      });
      if (track) play(track);
    } catch (e: any) { addToast(e.message, 'err'); }
  };

  const handleSimpleGenerate = async () => {
    const style = [simpleGenre, simpleMood].filter(Boolean).join(', ');
    const desc = simpleDesc.trim() || style || 'beautiful music';
    try {
      const track = await generate({ prompt: desc, style, instrumental: false, model: isGuest() ? 'V3_5' : 'V4' });
      if (track) play(track);
    } catch (e: any) { addToast(e.message, 'err'); }
  };

  const handleYtAnalyze = async () => {
    if (!ytUrl.trim() || !ytUrl.includes('youtu')) { addToast('유효한 YouTube URL을 입력해주세요', 'err'); return; }
    setYtAnalyzing(true);
    try {
      const res = await fetch('/api/yt-analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: ytUrl.trim() }) });
      if (!res.ok) throw new Error('분석 서버 오류 ' + res.status);
      const data = await res.json();
      if (data?.title || data?.genre || data?.style_prompt) { setYtAnalysis(data); addToast('분석 완료!', 'ok'); }
      else { addToast('분석 결과가 없습니다', 'err'); }
    } catch (e: any) { addToast(e.message, 'err'); }
    finally { setYtAnalyzing(false); }
  };

  const handleYtGenerate = async () => {
    if (!ytAnalysis) return;
    const style = ytAnalysis.style_prompt || ytAnalysis.genre || 'Pop';
    try {
      const track = await generate({ prompt: ytLyrics.trim() || style, style: style.slice(0, 200), title: ytAnalysis.title || 'YouTube Cover', instrumental: !ytLyrics.trim(), model });
      if (track) play(track);
    } catch (e: any) { addToast(e.message, 'err'); }
  };

  const handleMvGenerate = async () => {
    if (!mvTrackId.trim()) { addToast('트랙 ID를 선택해주세요', 'err'); return; }
    try {
      const res = await fetch('/api/kie-proxy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/api/v1/generate/mv', method: 'POST', body: { taskId: mvTrackId }, userName: user?.name || 'guest', userProvider: user?.provider || 'guest' }),
      });
      const data = await res.json();
      if (data?.data?.taskId) { addToast('MV 생성 시작! 완료까지 수 분 소요', 'ok', 5000); }
      else { addToast('MV 생성 실패', 'err'); }
    } catch (e: any) { addToast(e.message, 'err'); }
  };

  const recentTracks = history.slice(0, 4);

  return (
    <div className="py-4">
      {/* Mode Tabs */}
      <section className="mb-6">
        <div className="flex gap-2">
          {modes.map((mode, i) => (
            <motion.button key={mode} whileTap={{ scale: 0.95 }} onClick={() => setActiveMode(i)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all relative ${activeMode === i ? 'text-white' : 'bg-secondary text-muted-foreground hover:bg-accent'}`}
            >
              {activeMode === i && (
                <motion.div layoutId="activeMode" className="absolute inset-0 bg-gradient-to-r from-purple-600 to-purple-500 rounded-xl shadow-lg shadow-purple-500/20" transition={{ type: 'spring', duration: 0.5 }} />
              )}
              <span className="relative z-10">{mode}</span>
            </motion.button>
          ))}
        </div>
      </section>

      <AnimatePresence mode="wait">
        {/* ── 커스텀 모드 ── */}
        {activeMode === 0 && (
          <motion.div key="custom" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
            {/* 프리셋 */}
            <div className="mb-4">
              <PresetGrid onSelect={handlePresetSelect} />
            </div>

            {/* 입력 */}
            <div className="rounded-2xl p-5 bg-card border border-border mb-4">
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-transparent text-foreground text-sm font-semibold outline-none placeholder:text-muted-foreground mb-3 pb-3 border-b border-border"
                placeholder="곡 제목 (선택)" />
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                className="w-full bg-transparent text-foreground text-sm resize-none outline-none placeholder:text-muted-foreground min-h-[100px]"
                placeholder="가사를 입력하거나 원하는 분위기를 설명해주세요..." />
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                <span className="text-xs text-muted-foreground">{prompt.length}/500</span>
              </div>
            </div>

            {/* 모델 선택 */}
            <div className="mb-4">
              <ModelSelector value={model} onChange={setModel} />
            </div>

            {/* 고급 옵션 토글 */}
            <button onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3 hover:text-foreground transition-colors">
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              고급 설정
            </button>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mb-4">
                  <div className="rounded-2xl p-5 bg-card border border-border">
                    <AdvancedOptions bpm={bpm} setBpm={setBpm} vocal={vocal} setVocal={setVocal}
                      negativeTags={negativeTags} setNegativeTags={setNegativeTags}
                      instrumental={instrumental} setInstrumental={setInstrumental} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <GenButton onClick={handleCustomGenerate} disabled={isGenerating || !prompt.trim()} loading={isGenerating}
              label="음악 생성" icon={<Music className="w-5 h-5" />} />
          </motion.div>
        )}

        {/* ── 심플 모드 ── */}
        {activeMode === 1 && (
          <motion.div key="simple" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
            {/* Step indicator */}
            <div className="flex gap-1 mb-4">
              {['분위기', '장르', '설명'].map((s, i) => (
                <div key={s} className={`flex-1 h-1 rounded-full transition-all ${i <= simpleStep ? 'bg-purple-500' : 'bg-secondary'}`} />
              ))}
            </div>

            <div className="rounded-2xl p-5 bg-card border border-border mb-4">
              <AnimatePresence mode="wait">
                {simpleStep === 0 && (
                  <motion.div key="s0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <p className="text-sm font-bold mb-3">🎵 어떤 분위기의 곡을 원하세요?</p>
                    <div className="grid grid-cols-3 gap-2">
                      {moodOptions.map((m) => (
                        <button key={m.label} onClick={() => { setSimpleMood(m.style); setSimpleStep(1); }}
                          className={`py-3 rounded-xl text-sm font-medium transition-all ${simpleMood === m.style ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-secondary text-muted-foreground border border-transparent'}`}
                        >{m.emoji} {m.label}</button>
                      ))}
                    </div>
                  </motion.div>
                )}
                {simpleStep === 1 && (
                  <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <p className="text-sm font-bold mb-3">🎸 장르를 선택해주세요</p>
                    <div className="flex flex-wrap gap-2">
                      {genreOptions.map((g) => (
                        <button key={g.label} onClick={() => { setSimpleGenre(g.style); setSimpleStep(2); }}
                          className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${simpleGenre === g.style ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-secondary text-muted-foreground border border-transparent'}`}
                        >{g.label}</button>
                      ))}
                    </div>
                    <button onClick={() => setSimpleStep(0)} className="text-xs text-muted-foreground mt-3">← 이전</button>
                  </motion.div>
                )}
                {simpleStep === 2 && (
                  <motion.div key="s2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <p className="text-sm font-bold mb-3">✍️ 추가 설명 (선택)</p>
                    <input value={simpleDesc} onChange={(e) => setSimpleDesc(e.target.value)}
                      className="w-full bg-secondary text-foreground text-sm outline-none placeholder:text-muted-foreground px-4 py-3 rounded-xl"
                      placeholder="예: 비 오는 날 듣기 좋은 잔잔한 피아노곡" />
                    <div className="flex items-center gap-2 mt-3">
                      <button onClick={() => setSimpleStep(1)} className="text-xs text-muted-foreground">← 이전</button>
                      <div className="flex-1" />
                      <span className="text-xs text-muted-foreground">{simpleMood && '✓ 분위기'} {simpleGenre && '✓ 장르'}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {simpleStep === 2 && (
              <GenButton onClick={handleSimpleGenerate}
                disabled={isGenerating || (!simpleMood && !simpleGenre && !simpleDesc.trim())}
                loading={isGenerating} label="원클릭 생성" icon={<Zap className="w-5 h-5" />} />
            )}
          </motion.div>
        )}

        {/* ── YouTube 모드 ── */}
        {activeMode === 2 && (
          <motion.div key="youtube" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
            <div className="rounded-2xl p-5 bg-card border border-border mb-4">
              <p className="text-sm font-bold mb-3"><span className="text-red-500">▶</span> YouTube URL</p>
              <div className="flex gap-2">
                <input value={ytUrl} onChange={(e) => setYtUrl(e.target.value)}
                  className="flex-1 bg-secondary text-foreground text-sm outline-none placeholder:text-muted-foreground px-4 py-3 rounded-xl"
                  placeholder="https://youtube.com/watch?v=..." />
                <button onClick={handleYtAnalyze} disabled={ytAnalyzing || !ytUrl.trim()}
                  className={`px-4 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${ytAnalyzing || !ytUrl.trim() ? 'bg-muted text-muted-foreground' : 'bg-red-500 text-white'}`}>
                  {ytAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} 분석
                </button>
              </div>
            </div>

            {ytAnalysis && (
              <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="rounded-2xl p-5 bg-card border border-border mb-4">
                <p className="text-sm font-bold mb-2">🎯 분석 결과</p>
                <div className="space-y-1.5 text-sm">
                  {ytAnalysis.title && <p><span className="text-muted-foreground">제목:</span> {ytAnalysis.title}</p>}
                  {ytAnalysis.genre && <p><span className="text-muted-foreground">장르:</span> {ytAnalysis.genre}</p>}
                  {ytAnalysis.mood && <p><span className="text-muted-foreground">분위기:</span> {ytAnalysis.mood}</p>}
                  {ytAnalysis.bpm_estimate && <p><span className="text-muted-foreground">BPM:</span> {ytAnalysis.bpm_estimate}</p>}
                  {ytAnalysis.instruments && <p><span className="text-muted-foreground">악기:</span> {ytAnalysis.instruments}</p>}
                  {ytAnalysis.vocal_style && <p><span className="text-muted-foreground">보컬:</span> {ytAnalysis.vocal_style}</p>}
                  {ytAnalysis.style_prompt && <p className="mt-2 text-xs text-purple-400 bg-purple-500/10 px-3 py-2 rounded-lg">{ytAnalysis.style_prompt.slice(0, 150)}</p>}
                </div>
                <textarea value={ytLyrics} onChange={(e) => setYtLyrics(e.target.value)}
                  className="w-full mt-4 bg-secondary text-foreground text-sm resize-none outline-none placeholder:text-muted-foreground px-4 py-3 rounded-xl min-h-[80px]"
                  placeholder="가사 입력 (선택 — 비워두면 인스트루멘탈)" />
              </motion.div>
            )}

            {ytAnalysis ? (
              <GenButton onClick={handleYtGenerate} disabled={isGenerating} loading={isGenerating}
                label="YouTube 스타일로 생성" icon={<Video className="w-5 h-5" />} />
            ) : (
              <p className="text-center text-sm text-muted-foreground py-8">YouTube URL을 입력하고 분석 버튼을 눌러주세요</p>
            )}
          </motion.div>
        )}

        {/* ── MV 모드 ── */}
        {activeMode === 3 && (
          <motion.div key="mv" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
            <div className="rounded-2xl p-5 bg-card border border-border mb-4">
              <p className="text-sm font-bold mb-3">🎬 뮤직비디오 생성</p>
              <p className="text-xs text-muted-foreground mb-4">최근 생성한 곡을 선택하면 AI가 뮤직비디오를 만들어줍니다.</p>
              {history.length > 0 ? (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {history.slice(0, 10).map((t) => (
                    <button key={t.id} onClick={() => setMvTrackId(t.taskId || t.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                        mvTrackId === (t.taskId || t.id) ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-secondary border border-transparent'
                      }`}>
                      <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center text-lg flex-shrink-0">
                        {t.image_url ? <img src={t.image_url} alt="" className="w-full h-full object-cover rounded-lg" /> : '🎵'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{t.genMode} · {t.model}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-6">먼저 곡을 생성해주세요</p>
              )}
            </div>
            <GenButton onClick={handleMvGenerate} disabled={isGenerating || !mvTrackId} loading={isGenerating}
              label="MV ��성 시작" icon={<Video className="w-5 h-5" />} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent Tracks */}
      {recentTracks.length > 0 && (
        <motion.section initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="mt-8 mb-8">
          <div className="bg-card/60 backdrop-blur-sm rounded-3xl p-5 border border-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold flex items-center gap-2">🎵 최근 생성한 곡</h2>
              <span className="text-xs text-purple-400 font-medium px-3 py-1 bg-purple-500/10 rounded-full">{recentTracks.length}곡</span>
            </div>
            <div className="space-y-2">
              {recentTracks.map((track, i) => {
                const playing = currentTrack?.id === track.id && isPlaying;
                return (
                  <motion.div key={track.id} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.05 }}
                    onClick={() => play(track)} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${playing ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-background hover:bg-secondary border border-transparent'}`}>
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-secondary flex-shrink-0">
                      {track.image_url ? <img src={track.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">🎵</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{track.title}</p>
                      <p className="text-xs text-muted-foreground">{track.tags?.split(',')[0] || track.genMode}</p>
                    </div>
                    <button className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white flex-shrink-0">
                      {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.section>
      )}

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 mt-10 mb-8">
        <motion.div whileHover={{ scale: 1.05 }} className="bg-purple-500/10 rounded-2xl p-4 border border-purple-500/20">
          <TrendingUp className="w-5 h-5 text-purple-400 mb-2" />
          <p className="text-2xl font-bold">{history.length}곡</p>
          <p className="text-xs text-muted-foreground">총 생성</p>
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} className="bg-blue-500/10 rounded-2xl p-4 border border-blue-500/20">
          <Music className="w-5 h-5 text-blue-400 mb-2" />
          <p className="text-2xl font-bold">{user?.plan || 'Free'}</p>
          <p className="text-xs text-muted-foreground">현재 플랜</p>
        </motion.div>
      </section>
    </div>
  );
}
