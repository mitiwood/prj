export interface Track {
  id: string;
  taskId?: string;
  title: string;
  audio_url: string;
  video_url?: string;
  image_url?: string;
  tags?: string;
  lyrics?: string;
  created: number;
  type?: 'audio' | 'video';
  genMode?: string;
  model?: string;
  duration?: number;
  _owner?: { name: string; avatar?: string; provider: string };
}

export interface User {
  name: string;
  email?: string;
  avatar?: string;
  provider: string;
  plan?: string;
}

export interface CommunityTrack extends Track {
  likes?: number;
  dislikes?: number;
  plays?: number;
  comments_count?: number;
  owner_name?: string;
  owner_avatar?: string;
  owner_provider?: string;
}

export interface Profile {
  name: string;
  avatar?: string;
  provider: string;
  bio?: string;
  followers?: number;
  following?: number;
}
