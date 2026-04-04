import Sheet from '../ui/Sheet';
import { useStore } from '../../stores/useStore';
import { Link2, MessageSquare } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  trackId: string;
  title: string;
}

export default function ShareSheet({ open, onClose, trackId, title }: Props) {
  const addToast = useStore((s) => s.addToast);

  const copyLink = async () => {
    const url = `${window.location.origin}/community?track=${trackId}`;
    try {
      await navigator.clipboard.writeText(url);
      addToast('링크가 복사되었습니다', 'success');
    } catch {
      addToast('링크 복사에 실패했습니다', 'error');
    }
    onClose();
  };

  const shareKakao = () => {
    const w = window as unknown as Record<string, unknown>;
    const kakao = w['Kakao'] as
      | { Share?: { sendDefault: (o: unknown) => void } }
      | undefined;
    if (kakao?.Share) {
      kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: title,
          description: '띵곡에서 만든 AI 음악을 들어보세요!',
          imageUrl: 'https://ddinggok.com/images/og-image.png',
          link: {
            webUrl: `https://ddinggok.com/community?track=${trackId}`,
            mobileWebUrl: `https://ddinggok.com/community?track=${trackId}`,
          },
        },
      });
    } else {
      copyLink();
    }
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="공유하기">
      <div className="flex flex-col gap-3">
        <button
          onClick={copyLink}
          className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--border)]/50 transition"
        >
          <Link2 size={20} className="text-[var(--t2)]" />
          <span className="text-sm text-[var(--t1)]">링크 복사</span>
        </button>
        <button
          onClick={shareKakao}
          className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--border)]/50 transition"
        >
          <MessageSquare size={20} className="text-yellow-500" />
          <span className="text-sm text-[var(--t1)]">카카오톡 공유</span>
        </button>
      </div>
    </Sheet>
  );
}
