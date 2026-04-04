import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { fetchCommunityTracks, likeTrack, unlikeTrack } from '../lib/api';
import { useStore } from '../stores/useStore';
import { TrackCard } from '../components/community/TrackCard';
import { CommentSheet } from '../components/community/CommentSheet';
import { ShareSheet } from '../components/community/ShareSheet';
import type { CommunityTrack } from '../types';

export function CommunityPage() {
  const [tab, setTab] = useState<'popular' | 'latest' | 'following'>('popular');
  const [tracks, setTracks] = useState<CommunityTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [likedSet, setLikedSet] = useState<Set<string>>(new Set());
  const [commentTrack, setCommentTrack] = useState<string | null>(null);
  const [shareTrack, setShareTrack] = useState<{ id: string; title: string } | null>(null);
  const user = useStore((s) => s.user);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadTracks = useCallback(async () => {
    setLoading(true);
    const data = await fetchCommunityTracks(50);
    if (tab === 'popular') data.sort((a: any, b: any) => (b.likes || 0) - (a.likes || 0));
    setTracks(data);
    setLoading(false);
  }, [tab]);

  useEffect(() => { loadTracks(); }, [loadTracks]);

  const handleLike = async (trackId: string) => {
    if (!user) return;
    const isLiked = likedSet.has(trackId);
    if (isLiked) {
      await unlikeTrack(trackId, user.name, user.provider);
      setLikedSet((prev) => { const n = new Set(prev); n.delete(trackId); return n; });
      setTracks((prev) => prev.map((t) => t.id === trackId ? { ...t, likes: Math.max(0, (t.likes || 0) - 1) } : t));
    } else {
      await likeTrack(trackId, user.name, user.provider);
      setLikedSet((prev) => new Set(prev).add(trackId));
      setTracks((prev) => prev.map((t) => t.id === trackId ? { ...t, likes: (t.likes || 0) + 1 } : t));
    }
  };

  return (
    <div className="py-4">
      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {(['popular', 'latest', 'following'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t ? 'bg-purple-600 text-white' : 'bg-secondary text-muted-foreground'}`}>
            {t === 'popular' ? '🔥 인기' : t === 'latest' ? '✨ 최신' : '👥 팔로잉'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tracks.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">🎵</p>
          <p className="text-sm text-muted-foreground">아직 공유된 곡이 없어요</p>
        </div>
      ) : (
        <div>
          {tracks.map((track) => (
            <TrackCard
              key={track.id}
              track={track}
              liked={likedSet.has(track.id)}
              onLike={() => handleLike(track.id)}
              onComment={() => setCommentTrack(track.id)}
              onShare={() => setShareTrack({ id: track.id, title: track.title })}
            />
          ))}
          <div ref={sentinelRef} className="h-4" />
        </div>
      )}

      <CommentSheet open={!!commentTrack} onClose={() => setCommentTrack(null)} trackId={commentTrack || ''} />
      <ShareSheet open={!!shareTrack} onClose={() => setShareTrack(null)} trackId={shareTrack?.id || ''} title={shareTrack?.title || ''} />
    </div>
  );
}
