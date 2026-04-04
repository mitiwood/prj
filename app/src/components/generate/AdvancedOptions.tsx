import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Options {
  bpm: number;
  vocal: 'auto' | 'female' | 'male';
  instrumental: boolean;
  negative: string;
}

interface Props {
  options: Options;
  onChange: (o: Options) => void;
}

export default function AdvancedOptions({ options, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-[var(--t2)] hover:bg-[var(--border)]/50 transition"
      >
        고급 옵션
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="p-4 space-y-4 border-t border-[var(--border)]">
          <div>
            <label className="text-xs text-[var(--t3)] mb-1 block">
              BPM: {options.bpm}
            </label>
            <input
              type="range"
              min={40}
              max={200}
              value={options.bpm}
              onChange={(e) =>
                onChange({ ...options, bpm: Number(e.target.value) })
              }
              className="w-full accent-[var(--acc)]"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--t3)] mb-1 block">보컬</label>
            <div className="flex gap-2">
              {(['auto', 'female', 'male'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => onChange({ ...options, vocal: v })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    options.vocal === v
                      ? 'bg-[var(--acc)] text-white'
                      : 'bg-[var(--card)] text-[var(--t2)] border border-[var(--border)]'
                  }`}
                >
                  {v === 'auto' ? '자동' : v === 'female' ? '여성' : '남성'}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.instrumental}
              onChange={(e) =>
                onChange({ ...options, instrumental: e.target.checked })
              }
              className="accent-[var(--acc)]"
            />
            <span className="text-sm text-[var(--t2)]">
              인스트루멘탈 (보컬 없음)
            </span>
          </label>
          <div>
            <label className="text-xs text-[var(--t3)] mb-1 block">
              제외할 요소
            </label>
            <input
              type="text"
              placeholder="예: autotune, distortion"
              value={options.negative}
              onChange={(e) =>
                onChange({ ...options, negative: e.target.value })
              }
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--t1)] placeholder-[var(--t3)] outline-none focus:border-[var(--acc)] transition"
            />
          </div>
        </div>
      )}
    </div>
  );
}
