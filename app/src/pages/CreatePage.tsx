import { useState, useCallback } from 'react';
import { useStore } from '../stores/useStore';
import { useGenerate } from '../hooks/useGenerate';
import GenButton from '../components/generate/GenButton';
import ModelSelector from '../components/generate/ModelSelector';
import PresetGrid from '../components/generate/PresetGrid';
import AdvancedOptions from '../components/generate/AdvancedOptions';
import Chip from '../components/ui/Chip';
import type { Preset } from '../lib/engine/presets';
import { buildStyleString } from '../lib/engine/prompt-engine';
import { Music, Zap, Youtube, Film } from 'lucide-react';

type Mode = 'custom' | 'simple' | 'youtube' | 'mv';

const MODES: { id: Mode; label: string; icon: typeof Music }[] = [
  { id: 'custom', label: '커스텀', icon: Music },
  { id: 'simple', label: '심플', icon: Zap },
  { id: 'youtube', label: 'YouTube', icon: Youtube },
  { id: 'mv', label: 'MV', icon: Film },
];

const SIMPLE_MOODS = ['밝은', '슬픈', '신나는', '편안한', '강렬한', '몽환적'];
const SIMPLE_GENRES = [
  'K-Pop',
  'Ballad',
  'Hip-Hop',
  'EDM',
  'R&B',
  'Lo-Fi',
  'Rock',
  'Jazz',
];

export default function CreatePage() {
  const [mode, setMode] = useState<Mode>('custom');
  const isGenerating = useStore((s) => s.isGenerating);
  const history = useStore((s) => s.history);
  const { generate } = useGenerate();

  const [prompt, setPrompt] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const [advOpts, setAdvOpts] = useState({
    bpm: 120,
    vocal: 'auto' as const,
    instrumental: false,
    negative: '',
  });

  const [simpleStep, setSimpleStep] = useState(0);
  const [simpleMood, setSimpleMood] = useState('');
  const [simpleGenre, setSimpleGenre] = useState('');
  const [simpleDesc, setSimpleDesc] = useState('');

  const [ytUrl, setYtUrl] = useState('');

  const handleGenerate = useCallback(async () => {
    if (mode === 'custom') {
      const style = selectedPreset
        ? buildStyleString({
            genre: selectedPreset.genre,
            sub: selectedPreset.sub,
            mood: selectedPreset.mood,
            bpm: advOpts.bpm,
            vocal: advOpts.vocal,
            instruments: selectedPreset.instruments,
            negative: advOpts.negative,
          })
        : undefined;
      await generate({
        prompt: prompt || '자동 생성',
        style,
        lyrics: lyrics || undefined,
        instrumental: advOpts.instrumental,
      });
    } else if (mode === 'simple') {
      const style = buildStyleString({
        genre: simpleGenre,
        mood: simpleMood,
      });
      await generate({
        prompt: simpleDesc || `${simpleMood} ${simpleGenre} 곡`,
        style,
      });
    } else if (mode === 'youtube') {
      await generate({
        prompt: `YouTube 스타일 재해석: ${ytUrl}`,
      });
    }
  }, [
    mode,
    prompt,
    lyrics,
    selectedPreset,
    advOpts,
    simpleMood,
    simpleGenre,
    simpleDesc,
    ytUrl,
    generate,
  ]);

  const recent = history.slice(0, 5);

  return (
    <div className="p-4 space-y-6">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {MODES.map((m) => (
          <Chip
            key={m.id}
            label={m.label}
            active={mode === m.id}
            onClick={() => setMode(m.id)}
          />
        ))}
      </div>

      {mode === 'custom' && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-[var(--t2)] mb-1 block">
              프롬프트
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="어떤 음악을 만들까요? (예: 밝은 K-Pop, 비 오는 날 듣기 좋은 재즈)"
              className="w-full h-24 px-3 py-2 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--t1)] placeholder-[var(--t3)] outline-none focus:border-[var(--acc)] resize-none transition"
            />
          </div>
          <PresetGrid
            onSelect={(p) => setSelectedPreset(p)}
            selectedId={selectedPreset?.id}
          />
          <div>
            <label className="text-sm font-semibold text-[var(--t2)] mb-1 block">
              가사 (선택)
            </label>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="직접 가사를 입력하거나 비워두면 AI가 작성합니다"
              className="w-full h-20 px-3 py-2 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--t1)] placeholder-[var(--t3)] outline-none focus:border-[var(--acc)] resize-none transition"
            />
          </div>
          <ModelSelector />
          <AdvancedOptions options={advOpts} onChange={setAdvOpts} />
        </div>
      )}

      {mode === 'simple' && (
        <div className="space-y-4">
          {simpleStep === 0 && (
            <div>
              <h3 className="text-base font-bold text-[var(--t1)] mb-3">
                어떤 분위기의 곡을 원하세요?
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {SIMPLE_MOODS.map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setSimpleMood(m);
                      setSimpleStep(1);
                    }}
                    className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--acc)] transition text-sm font-medium text-[var(--t1)]"
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
          {simpleStep === 1 && (
            <div>
              <h3 className="text-base font-bold text-[var(--t1)] mb-3">
                장르를 선택하세요
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {SIMPLE_GENRES.map((g) => (
                  <button
                    key={g}
                    onClick={() => {
                      setSimpleGenre(g);
                      setSimpleStep(2);
                    }}
                    className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--acc)] transition text-sm font-medium text-[var(--t1)]"
                  >
                    {g}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setSimpleStep(0)}
                className="mt-2 text-xs text-[var(--acc)]"
              >
                이전
              </button>
            </div>
          )}
          {simpleStep === 2 && (
            <div>
              <h3 className="text-base font-bold text-[var(--t1)] mb-3">
                추가 설명 (선택)
              </h3>
              <textarea
                value={simpleDesc}
                onChange={(e) => setSimpleDesc(e.target.value)}
                placeholder="예: 드라이브할 때 듣기 좋은 곡"
                className="w-full h-20 px-3 py-2 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--t1)] placeholder-[var(--t3)] outline-none focus:border-[var(--acc)] resize-none transition"
              />
              <button
                onClick={() => setSimpleStep(1)}
                className="mt-2 text-xs text-[var(--acc)]"
              >
                이전
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'youtube' && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-[var(--t2)] mb-1 block">
              YouTube URL
            </label>
            <input
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="w-full px-3 py-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--t1)] placeholder-[var(--t3)] outline-none focus:border-[var(--acc)] transition"
            />
          </div>
          <p className="text-xs text-[var(--t3)]">
            YouTube 영상의 스타일을 분석하여 비슷한 분위기의 곡을 생성합니다.
          </p>
        </div>
      )}

      {mode === 'mv' && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--t2)]">
            보관함에서 트랙을 선택한 후 뮤직비디오를 생성합니다.
          </p>
          <p className="text-xs text-[var(--t3)]">기능 준비 중입니다.</p>
        </div>
      )}

      {mode !== 'mv' && (
        <GenButton
          onClick={handleGenerate}
          loading={isGenerating}
          disabled={
            isGenerating ||
            (mode === 'simple' && simpleStep < 2) ||
            (mode === 'youtube' && !ytUrl.trim())
          }
          label={mode === 'youtube' ? 'YouTube 스타일로 생성' : undefined}
        />
      )}

      <div>
        <h4 className="text-sm font-semibold text-[var(--t2)] mb-2">
          최근 생성한 곡
        </h4>
        {recent.length === 0 ? (
          <p className="text-xs text-[var(--t3)]">
            아직 생성한 곡이 없습니다
          </p>
        ) : (
          <div className="space-y-2">
            {recent.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 p-2 rounded-lg bg-[var(--card)] border border-[var(--border)]"
              >
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--border)] shrink-0">
                  {t.image_url ? (
                    <img
                      src={t.image_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-purple-600 to-indigo-700" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--t1)] truncate">
                    {t.title}
                  </p>
                  <p className="text-[10px] text-[var(--t3)]">
                    {t.model ?? 'AI'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
