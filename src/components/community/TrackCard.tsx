import { Heart, MessageCircle, Play, Pause, Share2 } from 'lucide-react';
import { motion } from 'framer-motion';
import type { CommunityTrack } from '../../types';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useStore } from '../../stores/useStore';

interface Props {
  track: CommunityTrack;
  onComment?: () => void;
  onShare?: () => void;
  onLike?: () => void;
  liked?: boolean;
}

export function TrackCard({ track, onComment, onShare, onLike, liked }: Props) {
  const { play, currentTrack, isPlaying } = useAudioPlayer();
  const playing = currentTrack?.id === track.id && isPlaying;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl border border-border p-4 mb-3">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-secondary overflow-hidden flex-shrink-0">
          {track.owner_avatar ? <img src={track.owner_avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs">👤</div>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{track.owner_name || '익명'}</p>
        </div>
      </div>

      <div onClick={() => play(track)} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 cursor-pointer hover:bg-secondary transition-colors mb-3">
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-background flex-shrink-0">
          {track.image_url ? <img src={track.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">🎵</div>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{track.title}</p>
          <p className="text-xs text-muted-foreground">{track.tags?.split(',').slice(0, 2).join(', ')}</p>
        </div>
        <button className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white flex-shrink-0">
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
      </div>

      <div className="flex items-center gap-4 text-muted-foreground">
        <button onClick={onLike} className={`flex items-center gap-1 text-xs transition-colors ${liked ? 'text-red-400' : 'hover:text-foreground'}`}>
          <Heart className={`w-4 h-4 ${liked ? 'fill-red-400' : ''}`} /> {track.likes || 0}
        </button>
        <button onClick={onComment} className="flex items-center gap-1 text-xs hover:text-foreground">
          <MessageCircle className="w-4 h-4" /> {track.comments_count || 0}
        </button>
        <button onClick={onShare} className="flex items-center gap-1 text-xs hover:text-foreground ml-auto">
          <Share2 className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
