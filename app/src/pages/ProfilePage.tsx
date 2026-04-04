import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { fetchProfile } from '../lib/api';
import type { Profile } from '../types';

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const [name, provider] = id.split(':');
    if (name && provider) {
      fetchProfile(name, provider)
        .then(setProfile)
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-[var(--acc)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-4 text-center text-[var(--t3)]">
        프로필을 찾을 수 없습니다
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-full overflow-hidden bg-[var(--border)] mb-3">
          {profile.avatar ? (
            <img
              src={profile.avatar}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center">
              <span className="text-white text-2xl font-bold">
                {profile.name[0]}
              </span>
            </div>
          )}
        </div>
        <h2 className="text-lg font-bold text-[var(--t1)]">{profile.name}</h2>
        <p className="text-sm text-[var(--t3)]">{profile.provider}</p>
        {profile.bio && (
          <p className="text-sm text-[var(--t2)] mt-2">{profile.bio}</p>
        )}
        <div className="flex gap-6 mt-3">
          <div className="text-center">
            <p className="text-base font-bold text-[var(--t1)]">
              {profile.followers ?? 0}
            </p>
            <p className="text-[10px] text-[var(--t3)]">팔로워</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-[var(--t1)]">
              {profile.following ?? 0}
            </p>
            <p className="text-[10px] text-[var(--t3)]">팔로잉</p>
          </div>
        </div>
        <button className="mt-4 px-6 py-2 rounded-full bg-[var(--acc)] text-white text-sm font-medium">
          팔로우
        </button>
      </div>
    </div>
  );
}
