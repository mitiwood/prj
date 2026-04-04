import { Sheet } from './ui/Sheet';
import { useStore } from '../stores/useStore';
import { GUEST_SONG_LIMIT } from '../stores/slices/authSlice';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LoginSheet({ open, onClose }: Props) {
  const { setGuestMode, addToast } = useStore();

  const handleGuest = () => {
    setGuestMode(true);
    onClose();
    addToast(`👤 게스트 모드 · ${GUEST_SONG_LIMIT}곡 무료 체험`, 'ok', 3000);
  };

  return (
    <Sheet open={open} onClose={onClose} title="로그인">
      <div className="space-y-3 mb-5">
        <a href="/api/auth/google"
          className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-white text-gray-800 font-semibold text-sm border border-gray-200 hover:bg-gray-50 transition-colors">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="" />
          Google로 시작하기
        </a>
        <a href="/api/auth/kakao"
          className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-[#FEE500] text-[#191919] font-semibold text-sm hover:brightness-95 transition-all">
          💬 카카오로 시작하기
        </a>
        <a href="/api/auth/naver"
          className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-[#03C75A] text-white font-semibold text-sm hover:brightness-95 transition-all">
          N 네이버로 시작하기
        </a>
      </div>
      <div className="border-t border-border pt-4">
        <button onClick={handleGuest}
          className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors">
          게스트로 시작하기 ({GUEST_SONG_LIMIT}곡 무료)
        </button>
      </div>
    </Sheet>
  );
}
