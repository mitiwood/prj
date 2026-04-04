import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SkipForward } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../stores/useStore';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { FullPlayer } from './player/FullPlayer';

export function MiniPlayer() {
  const { currentTrack, isPlaying, progress, duration, nextTrack } = useStore();
  const { togglePlay, audioRef } = useAudioPlayer();
  const [fullOpen, setFullOpen] = useState(false);

  if (!currentTrack) return null;

  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <>
      <motion.div
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        className="fixed bottom-[68px] left-0 right-0 z-[200] px-3"
      >
        <div
          onClick={() => setFullOpen(true)}
          className="max-w-[480px] mx-auto bg-card/95 backdrop-blur-xl rounded-2xl border border-border shadow-xl p-3 cursor-pointer"
        >
          {/* Progress bar */}
          <div className="absolute top-0 left-3 right-3 h-0.5 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 transition-all" style={{ width: `${pct}%` }} />
          </div>

          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl overflow-hidden bg-secondary flex-shrink-0">
              {currentTrack.image_url ? (
                <img src={currentTrack.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-lg">🎵</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{currentTrack.title}</p>
              <p className="text-xs text-muted-foreground truncate">{currentTrack.tags?.split(',')[0] || ''}</p>
            </div>
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button onClick={togglePlay} className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white">
                {isPlaying ? <Pause className="w-4.5 h-4.5" /> : <Play className="w-4.5 h-4.5 ml-0.5" />}
              </button>
              <button onClick={nextTrack} className="w-8 h-8 flex items-center justify-center text-muted-foreground">
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {fullOpen && <FullPlayer open={fullOpen} onClose={() => setFullOpen(false)} audioRef={audioRef} />}
      </AnimatePresence>
    </>
  );
}
