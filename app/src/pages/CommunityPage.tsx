import { useState, useEffect, useCallback } from 'react';
import { fetchCommunityTracks, likeTrack } from '../lib/api';
import { useStore } from '../stores/useStore';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import TrackCard from '../components/community/TrackCard';
import CommentSheet from '../components/community/CommentSheet';
import ShareSheet from '../components/community/ShareSheet';
import Chip from '../components/ui/Chip';
import type { CommunityTrack } from '../types';

type Tab = 'popular' | 'recent' | 'following';

export default function CommunityPage() {
  const user = useStore((s) => s.user);
  const addToast = useStore((s) => s.addToast);
  const { play } = useAudioPlayer();
  const [tab, setTab] = useState<Tab>('popular');
  const [tracks, setTracks] = useState<CommunityTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentTrack, setCommentTrack] = useState<string | null>(null);
  const [shareTrack, setShareTrack] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCommunityTracks(50);
      if (tab === 'popular')
        data.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
      else if (tab === 'recent')
        data.sort((a, b) => b.created - a.created);
      setTracks(data);
    } catch {
      addToast('커뮤니티를 불러오지 못했습니다', 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLike = async (track: CommunityTrack) => {
    if (!user) {
      useStore.getState().setLoginSheetOpen(true);
      return;
    }
    try {
      await likeTrack(track.id, {
        name: user.name,
        provider: user.provider,
      });
      setTracks((prev) =>
        prev.map((t) =>
          t.id === track.id ? { ...t, likes: (t.likes ?? 0) + 1 } : t,
        ),
      );
    } catch {
      addToast('좋아요에 실패했습니다', 'error');
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        {(['popular', 'recent', 'following'] as Tab[]).map((t) => (
          <Chip
            key={t}
            label={
              t === 'popular'
                ? '인기'
                : t === 'recent'
                  ? '최신'
                  : '팔로잉'
            }
            active={tab === t}
            onClick={() => setTab(t)}
          />
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-2 border-[var(--acc)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tracks.length === 0 ? (
        <p className="text-center text-sm text-[var(--t3)] py-8">
          곡이 없습니다
        </p>
      ) : (
        <div className="space-y-4">
          {tracks.map((track) => (
            <TrackCard
              key={track.id}
              track={track}
              onPlay={() => play(track, tracks)}
              onLike={() => handleLike(track)}
              onComment={() => setCommentTrack(track.id)}
              onShare={() =>
                setShareTrack({ id: track.id, title: track.title })
              }
            />
          ))}
        </div>
      )}

      {commentTrack && (
        <CommentSheet
          open={!!commentTrack}
          onClose={() => setCommentTrack(null)}
          trackId={commentTrack}
        />
      )}
      {shareTrack && (
        <ShareSheet
          open={!!shareTrack}
          onClose={() => setShareTrack(null)}
          trackId={shareTrack.id}
          title={shareTrack.title}
        />
      )}
    </div>
  );
}
