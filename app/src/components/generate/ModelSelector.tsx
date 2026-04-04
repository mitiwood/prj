import { MODEL_PROFILES } from '../../lib/engine/model-profiles';
import { useStore } from '../../stores/useStore';
import { clsx } from 'clsx';
import { Zap } from 'lucide-react';

export default function ModelSelector() {
  const genModel = useStore((s) => s.genModel);
  const setGenModel = useStore((s) => s.setGenModel);
  const user = useStore((s) => s.user);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-[var(--t2)]">AI 모델</h4>
      <div className="grid grid-cols-2 gap-2">
        {Object.values(MODEL_PROFILES).map((m) => (
          <button
            key={m.id}
            onClick={() => setGenModel(m.id)}
            className={clsx(
              'p-3 rounded-xl text-left transition border',
              genModel === m.id
                ? 'border-[var(--acc)] bg-[var(--acc)]/10'
                : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--acc)]/50',
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-bold text-[var(--t1)]">
                {m.name}
              </span>
              <span className="flex items-center gap-0.5 text-xs text-[var(--t3)]">
                <Zap size={10} /> {m.speed}
              </span>
            </div>
            <p className="text-[10px] text-[var(--t3)] line-clamp-1">
              {m.desc}
            </p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--t3)]">
                {m.credits}크레딧
              </span>
            </div>
          </button>
        ))}
      </div>
      {!user && (
        <p className="text-xs text-[var(--t3)] text-center mt-1">
          게스트는 V3.5만 사용 가능합니다. 로그인하면 모든 모델을 이용할 수
          있어요.
        </p>
      )}
    </div>
  );
}
