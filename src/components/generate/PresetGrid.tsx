import { PRESET_CATEGORIES, PRESETS, type Preset } from '../../lib/engine/presets';
import { useState } from 'react';

interface Props {
  onSelect: (preset: Preset & { key: string }) => void;
}

export function PresetGrid({ onSelect }: Props) {
  const [activeCat, setActiveCat] = useState('popular');

  const presetKeys = PRESET_CATEGORIES[activeCat]?.presets || [];

  return (
    <div>
      <p className="text-sm font-bold mb-2">🎨 프리셋</p>
      {/* Category tabs */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
        {Object.entries(PRESET_CATEGORIES).map(([key, cat]) => (
          <button
            key={key}
            onClick={() => setActiveCat(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              activeCat === key
                ? 'bg-purple-600 text-white'
                : 'bg-secondary text-muted-foreground hover:bg-accent'
            }`}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>
      {/* Preset chips */}
      <div className="grid grid-cols-3 gap-2">
        {presetKeys.map((key) => {
          const p = PRESETS[key];
          if (!p) return null;
          return (
            <button
              key={key}
              onClick={() => onSelect({ ...p, key })}
              className="p-2.5 rounded-xl bg-secondary/50 border border-border hover:border-purple-400/30 transition-all text-left"
            >
              <div className="text-lg mb-0.5">{p.icon}</div>
              <p className="text-xs font-semibold truncate">{p.label}</p>
              <p className="text-[10px] text-muted-foreground">{p.bpm} BPM</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
