import { useState } from 'react';
import { useStore } from '../../stores/useStore';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { Play, Pause, SkipForward } from 'lucide-react';
import FullPlayer from './FullPlayer';

export default function MiniPlayer() {
  const currentTrack = useStore((s) => s.currentTrack);
  const isPlaying = useStore((s) => s.isPlaying);
  const progress = useStore((s) => s.progress);
  const duration = useStore((s) => s.duration);
  const { togglePlay } = useAudioPlayer();
  const nextTrack = useStore((s) => s.nextTrack);
  const [showFull, setShowFull] = useState(false);

  if (!currentTrack) return null;
  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <>
      <div
        className="fixed bottom-[60px] left-1/2 -translate-x-1/2 w-full max-w-[480px] z-[60] bg-[var(--card)]/95 backdrop-blur-lg border-t border-[var(--border)] cursor-pointer"
        onClick={() => setShowFull(true)}
      >
        <div className="h-0.5 bg-[var(--border)]">
          <div
            className="h-full bg-[var(--acc)] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--border)] shrink-0">
            {currentTrack.image_url ? (
              <img
                src={currentTrack.image_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-purple-600 to-indigo-700" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--t1)] truncate">
              {currentTrack.title}
            </p>
            <p className="text-[10px] text-[var(--t3)] truncate">
              {currentTrack._owner?.name ?? '띵곡'}
            </p>
          </div>
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={togglePlay}
              className="p-2 rounded-full hover:bg-[var(--border)] transition"
            >
              {isPlaying ? (
                <Pause size={20} className="text-[var(--t1)]" />
              ) : (
                <Play size={20} className="text-[var(--t1)]" />
              )}
            </button>
            <button
              onClick={nextTrack}
              className="p-2 rounded-full hover:bg-[var(--border)] transition"
            >
              <SkipForward size={18} className="text-[var(--t2)]" />
            </button>
          </div>
        </div>
      </div>
      <FullPlayer open={showFull} onClose={() => setShowFull(false)} />
    </>
  );
}
