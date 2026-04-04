import { motion } from 'framer-motion';
import { X, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Heart, Share2, ChevronDown, Volume2 } from 'lucide-react';
import { useStore } from '../../stores/useStore';
import { useRef, useEffect, useState } from 'react';
import { LyricsView } from './LyricsView';

interface Props {
  open: boolean;
  onClose: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export function FullPlayer({ open, onClose, audioRef }: Props) {
  const { currentTrack, isPlaying, setIsPlaying, progress, duration, shuffle, repeat, volume,
    toggleShuffle, toggleRepeat, setVolume, nextTrack, prevTrack, setProgress } = useStore();
  const [showLyrics, setShowLyrics] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !audioRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = pct * duration;
    setProgress(pct * duration);
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  if (!open || !currentTrack) return null;

  return (
    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed inset-0 z-[9999] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={onClose}><ChevronDown className="w-6 h-6" /></button>
        <p className="text-xs text-muted-foreground font-medium">Now Playing</p>
        <button onClick={() => setShowLyrics(!showLyrics)} className={`text-xs px-2.5 py-1 rounded-full ${showLyrics ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground'}`}>
          가사
        </button>
      </div>

      {showLyrics ? (
        <LyricsView lyrics={currentTrack.lyrics || ''} progress={progress} />
      ) : (
        <>
          {/* Cover Art */}
          <div className="flex-1 flex items-center justify-center px-10">
            <motion.div animate={{ rotate: isPlaying ? 360 : 0 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              className="w-64 h-64 rounded-full overflow-hidden shadow-2xl shadow-purple-500/20 border-4 border-white/5">
              {currentTrack.image_url ? (
                <img src={currentTrack.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-6xl">🎵</div>
              )}
            </motion.div>
          </div>

          {/* Track info */}
          <div className="px-8 mb-4">
            <h2 className="text-xl font-bold truncate">{currentTrack.title}</h2>
            <p className="text-sm text-muted-foreground truncate">{currentTrack.tags?.split(',')[0] || currentTrack.genMode || ''}</p>
          </div>
        </>
      )}

      {/* Progress */}
      <div className="px-8 mb-2">
        <div ref={progressRef} onClick={handleSeek} className="w-full h-1.5 bg-secondary rounded-full cursor-pointer relative">
          <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${duration > 0 ? (progress / duration) * 100 : 0}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>{formatTime(progress)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-6 pb-4">
        <button onClick={toggleShuffle} className={shuffle ? 'text-purple-400' : 'text-muted-foreground'}>
          <Shuffle className="w-5 h-5" />
        </button>
        <button onClick={prevTrack}><SkipBack className="w-6 h-6" /></button>
        <button onClick={handlePlayPause} className="w-16 h-16 rounded-full bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/30">
          {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
        </button>
        <button onClick={nextTrack}><SkipForward className="w-6 h-6" /></button>
        <button onClick={toggleRepeat} className={repeat !== 'off' ? 'text-purple-400' : 'text-muted-foreground'}>
          {repeat === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
        </button>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-3 px-8 pb-8">
        <Volume2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input type="range" min={0} max={1} step={0.01} value={volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            if (audioRef.current) audioRef.current.volume = v;
          }}
          className="flex-1 accent-purple-500 h-1" />
      </div>
    </motion.div>
  );
}
