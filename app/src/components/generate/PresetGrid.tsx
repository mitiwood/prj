import { useState } from 'react';
import {
  PRESET_CATEGORIES,
  getPresetsByCategory,
} from '../../lib/engine/presets';
import type { Preset } from '../../lib/engine/presets';
import Chip from '../ui/Chip';

interface Props {
  onSelect: (preset: Preset) => void;
  selectedId?: string;
}

export default function PresetGrid({ onSelect, selectedId }: Props) {
  const [category, setCategory] = useState('popular');
  const presets = getPresetsByCategory(category);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {PRESET_CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            label={c.label}
            icon={c.icon}
            active={category === c.id}
            onClick={() => setCategory(c.id)}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className={`p-3 rounded-xl text-center transition border ${
              selectedId === p.id
                ? 'border-[var(--acc)] bg-[var(--acc)]/10'
                : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--acc)]/50'
            }`}
          >
            <div className="text-2xl mb-1">{p.icon}</div>
            <div className="text-xs font-medium text-[var(--t1)] line-clamp-1">
              {p.label}
            </div>
            <div className="text-[10px] text-[var(--t3)]">{p.bpm}BPM</div>
          </button>
        ))}
      </div>
    </div>
  );
}
