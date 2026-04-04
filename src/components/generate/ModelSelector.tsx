import { MODEL_PROFILES, getDefaultModel } from '../../lib/engine/model-profiles';
import { useStore } from '../../stores/useStore';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function ModelSelector({ value, onChange }: Props) {
  const user = useStore((s) => s.user);
  const isGuest = useStore((s) => s.isGuest);
  const defaultModel = getDefaultModel(isGuest());

  return (
    <div>
      <p className="text-sm font-bold mb-2">🤖 AI 모델</p>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(MODEL_PROFILES).map(([key, profile]) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`p-3 rounded-xl text-left transition-all border ${
              value === key
                ? 'bg-purple-500/15 border-purple-500/40 shadow-sm'
                : 'bg-secondary/50 border-border hover:border-purple-400/20'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-bold">{profile.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                profile.speed === 'fast' ? 'bg-green-500/15 text-green-400' :
                profile.speed === 'slow' ? 'bg-orange-500/15 text-orange-400' :
                'bg-blue-500/15 text-blue-400'
              }`}>
                {profile.speed === 'fast' ? '⚡빠름' : profile.speed === 'slow' ? '🐢느림' : '⏱보통'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">{profile.desc}</p>
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {profile.strengths.slice(0, 2).map((s) => (
                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">{s}</span>
              ))}
            </div>
          </button>
        ))}
      </div>
      {!user && (
        <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
          ⚡ 비회원은 빠른 V3.5가 기본이에요. 로그인하면 고품질 모델 사용 가능!
        </p>
      )}
    </div>
  );
}
