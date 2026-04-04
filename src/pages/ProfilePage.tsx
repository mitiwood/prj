import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, UserPlus, UserMinus } from 'lucide-react';
import { fetchProfile, API_BASE, fetchCommunityTracks } from '../lib/api';
import { useStore } from '../stores/useStore';
import { TrackCard } from '../components/community/TrackCard';
import type { Profile, CommunityTrack } from '../types';

export function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tracks, setTracks] = useState<CommunityTrack[]>([]);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const user = useStore((s) => s.user);

  useEffect(() => {
    if (!id) return;
    const [name, provider] = id.split(':');
    setLoading(true);
    Promise.all([
      fetchProfile(name, provider || 'google'),
      fetchCommunityTracks(50).then((t) => t.filter((tr: any) => tr.owner_name === name)),
    ]).then(([p, t]) => {
      setProfile(p);
      setTracks(t);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleFollow = async () => {
    if (!user || !profile) return;
    await fetch(`${API_BASE}/profile?action=follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ follower: user.name, followerProvider: user.provider, target: profile.name, targetProvider: profile.provider }),
    });
    setFollowing(!following);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!profile) return <div className="text-center py-20 text-muted-foreground">프로필을 찾을 수 없습니다</div>;

  return (
    <div className="py-4">
      <button onClick={() => window.history.back()} className="mb-4"><ArrowLeft className="w-5 h-5" /></button>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6">
        <div className="w-20 h-20 rounded-full bg-secondary overflow-hidden mx-auto mb-3">
          {profile.avatar ? <img src={profile.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-3xl">👤</div>}
        </div>
        <h1 className="text-xl font-bold">{profile.name}</h1>
        {profile.bio && <p className="text-sm text-muted-foreground mt-1">{profile.bio}</p>}

        <div className="flex justify-center gap-8 mt-4">
          <div className="text-center"><p className="font-bold">{tracks.length}</p><p className="text-xs text-muted-foreground">곡</p></div>
          <div className="text-center"><p className="font-bold">{profile.followers || 0}</p><p className="text-xs text-muted-foreground">팔로워</p></div>
          <div className="text-center"><p className="font-bold">{profile.following || 0}</p><p className="text-xs text-muted-foreground">팔로잉</p></div>
        </div>

        {user && user.name !== profile.name && (
          <button onClick={handleFollow}
            className={`mt-4 px-6 py-2 rounded-xl text-sm font-bold flex items-center gap-2 mx-auto ${
              following ? 'bg-secondary text-muted-foreground' : 'bg-purple-600 text-white'
            }`}>
            {following ? <><UserMinus className="w-4 h-4" /> 팔로잉</> : <><UserPlus className="w-4 h-4" /> 팔로우</>}
          </button>
        )}
      </motion.div>

      <h2 className="text-base font-bold mb-3">🎵 곡 목록</h2>
      {tracks.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">아직 공유된 곡이 없어요</p>
      ) : (
        tracks.map((t) => <TrackCard key={t.id} track={t} />)
      )}
    </div>
  );
}
