import { Sheet } from '../ui/Sheet';
import { Link, Copy, MessageSquare } from 'lucide-react';
import { useStore } from '../../stores/useStore';

interface Props {
  open: boolean;
  onClose: () => void;
  trackId: string;
  title: string;
}

export function ShareSheet({ open, onClose, trackId, title }: Props) {
  const addToast = useStore((s) => s.addToast);

  const shareUrl = `${window.location.origin}/?track=${trackId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      addToast('링크가 복사되었어요!', 'ok');
      onClose();
    });
  };

  const shareKakao = () => {
    if ((window as any).Kakao?.Share) {
      (window as any).Kakao.Share.sendDefault({
        objectType: 'feed',
        content: { title, description: '띵곡 AI Music Studio에서 만든 곡이에요!', imageUrl: '', link: { webUrl: shareUrl, mobileWebUrl: shareUrl } },
        buttons: [{ title: '들어보기', link: { webUrl: shareUrl, mobileWebUrl: shareUrl } }],
      });
    } else {
      copyLink();
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="공유하기">
      <div className="space-y-2">
        <button onClick={copyLink} className="w-full flex items-center gap-3 p-4 rounded-xl bg-secondary hover:bg-accent transition-colors">
          <Copy className="w-5 h-5 text-purple-400" />
          <span className="text-sm font-medium">링크 복사</span>
        </button>
        <button onClick={shareKakao} className="w-full flex items-center gap-3 p-4 rounded-xl bg-secondary hover:bg-accent transition-colors">
          <MessageSquare className="w-5 h-5 text-yellow-400" />
          <span className="text-sm font-medium">카카오톡 공유</span>
        </button>
      </div>
    </Sheet>
  );
}
