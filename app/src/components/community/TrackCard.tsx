import type { CommunityTrack } from '../../types';
import { Heart, MessageCircle, Share2, Play } from 'lucide-react';

interface Props {
  track: CommunityTrack;
  onPlay?: () => void;
  onLike?: () => void;
  onComment?: () => void;
  onShare?: () => void;
}

export default function TrackCard({
  track,
  onPlay,
  onLike,
  onComment,
  onShare,
}: Props) {
  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <div className="w-8 h-8 rounded-full overflow-hidden bg-[var(--border)]">
          {track.owner_avatar ? (
            <img
              src={track.owner_avatar}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-[var(--acc)] flex items-center justify-center">
              <span className="text-white text-xs">
                {(track.owner_name ?? '?')[0]}
              </span>
            </div>
          )}
        </div>
        <span className="text-sm font-medium text-[var(--t1)]">
          {track.owner_name ?? '익명'}
        </span>
      </div>

      <div
        className="relative aspect-video bg-[var(--border)] cursor-pointer"
        onClick={onPlay}
      >
        {track.image_url ? (
          <img
            src={track.image_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-600 to-indigo-700" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
            <Play size={24} className="text-purple-600 ml-1" />
          </div>
        </div>
      </div>

      <div className="p-3">
        <h3 className="text-sm font-semibold text-[var(--t1)] mb-2 line-clamp-1">
          {track.title}
        </h3>
        {track.tags && (
          <p className="text-[10px] text-[var(--t3)] mb-2 line-clamp-1">
            {track.tags}
          </p>
        )}
        <div className="flex items-center gap-4">
          <button
            onClick={onLike}
            className="flex items-center gap-1 text-[var(--t3)] hover:text-red-400 transition"
          >
            <Heart size={16} /> <span className="text-xs">{track.likes ?? 0}</span>
          </button>
          <button
            onClick={onComment}
            className="flex items-center gap-1 text-[var(--t3)] hover:text-blue-400 transition"
          >
            <MessageCircle size={16} />{' '}
            <span className="text-xs">{track.comments_count ?? 0}</span>
          </button>
          <button
            onClick={onShare}
            className="flex items-center gap-1 text-[var(--t3)] hover:text-green-400 transition"
          >
            <Share2 size={16} />
          </button>
          {track.plays !== undefined && (
            <span className="text-[10px] text-[var(--t3)] ml-auto">
              재생 {track.plays}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
