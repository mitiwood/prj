import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../stores/useStore';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Shuffle,
  Volume2,
  ChevronDown,
  FileText,
} from 'lucide-react';
import { useState } from 'react';
import LyricsView from './LyricsView';

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function FullPlayer({ open, onClose }: Props) {
  const currentTrack = useStore((s) => s.currentTrack);
  const isPlaying = useStore((s) => s.isPlaying);
  const progress = useStore((s) => s.progress);
  const duration = useStore((s) => s.duration);
  const volume = useStore((s) => s.volume);
  const repeat = useStore((s) => s.repeat);
  const shuffle = useStore((s) => s.shuffle);
  const setVolume = useStore((s) => s.setVolume);
  const { togglePlay, seek } = useAudioPlayer();
  const nextTrack = useStore((s) => s.nextTrack);
  const prevTrack = useStore((s) => s.prevTrack);
  const toggleShuffle = useStore((s) => s.toggleShuffle);
  const toggleRepeat = useStore((s) => s.toggleRepeat);
  const [showLyrics, setShowLyrics] = useState(false);

  if (!currentTrack) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed inset-0 z-[200] bg-[var(--bg)] flex flex-col"
        >
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={onClose} className="p-2">
              <ChevronDown size={24} className="text-[var(--t1)]" />
            </button>
            <span className="text-sm font-medium text-[var(--t2)]">
              지금 재생 중
            </span>
            <button
              onClick={() => setShowLyrics(!showLyrics)}
              className="p-2"
            >
              <FileText
                size={20}
                className={
                  showLyrics ? 'text-[var(--acc)]' : 'text-[var(--t2)]'
                }
              />
            </button>
          </div>

          {showLyrics ? (
            <LyricsView lyrics={currentTrack.lyrics} progress={progress} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center px-8">
              <div className="w-64 h-64 rounded-2xl overflow-hidden shadow-2xl mb-8">
                {currentTrack.image_url ? (
                  <img
                    src={currentTrack.image_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center">
                    <span className="text-6xl">🎵</span>
                  </div>
                )}
              </div>
              <h2 className="text-xl font-bold text-[var(--t1)] text-center mb-1 line-clamp-1">
                {currentTrack.title}
              </h2>
              <p className="text-sm text-[var(--t3)] mb-6">
                {currentTrack._owner?.name ?? '띵곡'}
              </p>
            </div>
          )}

          <div className="px-8 mb-2">
            <input
              type="range"
              min={0}
              max={duration || 1}
              value={progress}
              step={0.1}
              onChange={(e) => seek(Number(e.target.value))}
              className="w-full accent-[var(--acc)] h-1"
            />
            <div className="flex justify-between text-[10px] text-[var(--t3)] mt-1">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 mb-4">
            <button onClick={toggleShuffle} className="p-2">
              <Shuffle
                size={20}
                className={
                  shuffle ? 'text-[var(--acc)]' : 'text-[var(--t3)]'
                }
              />
            </button>
            <button onClick={prevTrack} className="p-2">
              <SkipBack size={24} className="text-[var(--t1)]" />
            </button>
            <button
              onClick={togglePlay}
              className="w-14 h-14 rounded-full bg-[var(--acc)] flex items-center justify-center shadow-lg"
            >
              {isPlaying ? (
                <Pause size={28} className="text-white" />
              ) : (
                <Play size={28} className="text-white ml-1" />
              )}
            </button>
            <button onClick={nextTrack} className="p-2">
              <SkipForward size={24} className="text-[var(--t1)]" />
            </button>
            <button onClick={toggleRepeat} className="p-2 relative">
              <Repeat
                size={20}
                className={
                  repeat !== 'off'
                    ? 'text-[var(--acc)]'
                    : 'text-[var(--t3)]'
                }
              />
              {repeat === 'one' && (
                <span className="absolute -top-1 -right-1 text-[8px] text-[var(--acc)] font-bold">
                  1
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 px-8 mb-8">
            <Volume2 size={16} className="text-[var(--t3)]" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 accent-[var(--acc)] h-1"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
