interface Props {
  bpm: number;
  setBpm: (v: number) => void;
  vocal: string;
  setVocal: (v: string) => void;
  negativeTags: string;
  setNegativeTags: (v: string) => void;
  instrumental: boolean;
  setInstrumental: (v: boolean) => void;
}

export function AdvancedOptions({ bpm, setBpm, vocal, setVocal, negativeTags, setNegativeTags, instrumental, setInstrumental }: Props) {
  return (
    <div className="space-y-4">
      {/* BPM */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-sm font-bold">🥁 BPM</p>
          <span className="text-xs text-purple-400 font-mono">{bpm}</span>
        </div>
        <input
          type="range" min={60} max={200} value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
          className="w-full accent-purple-500 h-1.5"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>느림 60</span><span>보통 120</span><span>빠름 200</span>
        </div>
      </div>

      {/* Vocal */}
      <div>
        <p className="text-sm font-bold mb-1.5">🎤 보컬</p>
        <div className="flex gap-2">
          {[
            { val: '', label: '자동' },
            { val: 'f', label: '여성' },
            { val: 'm', label: '남성' },
          ].map((opt) => (
            <button
              key={opt.val}
              onClick={() => setVocal(opt.val)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
                vocal === opt.val
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'bg-secondary text-muted-foreground border border-transparent'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Instrumental toggle */}
      <button
        onClick={() => setInstrumental(!instrumental)}
        className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all ${
          instrumental
            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
            : 'bg-secondary text-muted-foreground border border-transparent'
        }`}
      >
        🎹 인스트루멘탈 {instrumental ? 'ON' : 'OFF'}
      </button>

      {/* Negative tags */}
      <div>
        <p className="text-sm font-bold mb-1.5">🚫 제외 태그</p>
        <input
          value={negativeTags}
          onChange={(e) => setNegativeTags(e.target.value)}
          className="w-full bg-secondary text-foreground text-sm outline-none placeholder:text-muted-foreground px-3 py-2.5 rounded-xl"
          placeholder="제외할 스타일 (예: autotune, screaming)"
        />
      </div>
    </div>
  );
}
