import Sheet from '../ui/Sheet';
import { useStore } from '../../stores/useStore';

const providers = [
  { id: 'google', label: 'Google', color: 'bg-white text-gray-800', icon: 'G' },
  { id: 'kakao', label: '카카오', color: 'bg-yellow-400 text-gray-900', icon: 'K' },
  { id: 'naver', label: '네이버', color: 'bg-green-500 text-white', icon: 'N' },
];

export default function LoginSheet() {
  const open = useStore((s) => s.loginSheetOpen);
  const setOpen = useStore((s) => s.setLoginSheetOpen);
  const setGuestMode = useStore((s) => s.setGuestMode);

  const handleOAuth = (provider: string) => {
    window.location.href = `/api/auth/${provider}`;
  };

  const handleGuest = () => {
    setGuestMode(true);
    setOpen(false);
  };

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="로그인">
      <div className="flex flex-col gap-3">
        <p className="text-[var(--t2)] text-sm text-center mb-2">
          로그인하고 무제한으로 AI 음악을 만들어보세요
        </p>
        {providers.map((p) => (
          <button
            key={p.id}
            onClick={() => handleOAuth(p.id)}
            className={`${p.color} w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition hover:opacity-90`}
          >
            <span className="w-6 h-6 rounded-full bg-black/10 flex items-center justify-center text-xs font-bold">
              {p.icon}
            </span>
            {p.label}로 계속
          </button>
        ))}
        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--border)]" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-[var(--card)] px-3 text-xs text-[var(--t3)]">
              또는
            </span>
          </div>
        </div>
        <button
          onClick={handleGuest}
          className="w-full py-3 rounded-xl border border-[var(--border)] text-[var(--t2)] text-sm font-medium hover:border-[var(--acc)] transition"
        >
          게스트로 시작 (5곡 무료)
        </button>
      </div>
    </Sheet>
  );
}
