export interface Preset {
  id: string;
  genre: string;
  sub?: string;
  mood: string;
  bpm: number;
  instruments: string[];
  vocal: string;
  desc: string;
  icon: string;
  label: string;
  inst?: boolean;
}

export interface PresetCategory {
  id: string;
  label: string;
  icon: string;
}

export const PRESET_CATEGORIES: PresetCategory[] = [
  { id: 'popular', label: '인기', icon: '🔥' },
  { id: 'dance', label: '댄스', icon: '💃' },
  { id: 'vocal', label: '보컬', icon: '🎤' },
  { id: 'inst', label: '연주', icon: '🎸' },
  { id: 'mood', label: '분위기', icon: '🌙' },
];

export const PRESETS: Preset[] = [
  { id: 'kpop-bright', genre: 'K-Pop', mood: 'bright', bpm: 120, instruments: ['synth', 'drums'], vocal: 'auto', desc: '밝은 K-Pop', icon: '🎵', label: '밝은 케이팝' },
  { id: 'kpop-powerful', genre: 'K-Pop', mood: 'powerful', bpm: 130, instruments: ['synth', 'bass', 'drums'], vocal: 'auto', desc: '파워풀 K-Pop', icon: '💪', label: '파워 케이팝' },
  { id: 'ballad-sad', genre: 'Ballad', mood: 'sad', bpm: 72, instruments: ['piano', 'strings'], vocal: 'auto', desc: '슬픈 발라드', icon: '😢', label: '슬픈 발라드' },
  { id: 'ballad-warm', genre: 'Ballad', mood: 'warm', bpm: 80, instruments: ['acoustic guitar', 'piano'], vocal: 'auto', desc: '따뜻한 발라드', icon: '☀️', label: '따뜻한 발라드' },
  { id: 'hiphop-trap', genre: 'Hip-Hop', sub: 'Trap', mood: 'dark', bpm: 140, instruments: ['808', 'hihat'], vocal: 'male', desc: '트랩 비트', icon: '🔥', label: '트랩' },
  { id: 'hiphop-boom', genre: 'Hip-Hop', sub: 'Boom Bap', mood: 'chill', bpm: 90, instruments: ['drums', 'bass', 'sample'], vocal: 'male', desc: '붐뱁 비트', icon: '🎤', label: '붐뱁' },
  { id: 'rnb-smooth', genre: 'R&B', mood: 'smooth', bpm: 85, instruments: ['keys', 'bass', 'drums'], vocal: 'auto', desc: '스무스 R&B', icon: '🎷', label: '스무스 R&B' },
  { id: 'edm-house', genre: 'EDM', sub: 'House', mood: 'energetic', bpm: 128, instruments: ['synth', 'kick', 'clap'], vocal: 'auto', desc: '하우스 비트', icon: '🏠', label: '하우스' },
  { id: 'edm-future', genre: 'EDM', sub: 'Future Bass', mood: 'bright', bpm: 150, instruments: ['supersaw', 'drums'], vocal: 'auto', desc: '퓨처 베이스', icon: '🌈', label: '퓨처 베이스' },
  { id: 'rock-indie', genre: 'Rock', sub: 'Indie', mood: 'dreamy', bpm: 110, instruments: ['electric guitar', 'drums', 'bass'], vocal: 'auto', desc: '인디 록', icon: '🎸', label: '인디 록' },
  { id: 'rock-punk', genre: 'Rock', sub: 'Punk', mood: 'aggressive', bpm: 170, instruments: ['distortion guitar', 'drums'], vocal: 'male', desc: '펑크 록', icon: '⚡', label: '펑크 록' },
  { id: 'jazz-smooth', genre: 'Jazz', mood: 'smooth', bpm: 100, instruments: ['piano', 'sax', 'bass', 'drums'], vocal: 'auto', desc: '스무스 재즈', icon: '🎹', label: '스무스 재즈' },
  { id: 'jazz-bossa', genre: 'Jazz', sub: 'Bossa Nova', mood: 'warm', bpm: 120, instruments: ['nylon guitar', 'percussion'], vocal: 'female', desc: '보사노바', icon: '🏖️', label: '보사노바' },
  { id: 'lofi-chill', genre: 'Lo-Fi', mood: 'chill', bpm: 75, instruments: ['vinyl', 'keys', 'drums'], vocal: 'auto', desc: '로파이 칠', icon: '🌙', label: '로파이 칠', inst: True },
  { id: 'lofi-rain', genre: 'Lo-Fi', mood: 'melancholic', bpm: 70, instruments: ['rain', 'piano', 'drums'], vocal: 'auto', desc: '비 오는 날 로파이', icon: '🌧️', label: '비 오는 로파이', inst: True },
  { id: 'classical-piano', genre: 'Classical', mood: 'elegant', bpm: 90, instruments: ['piano'], vocal: 'auto', desc: '클래식 피아노', icon: '🎹', label: '클래식 피아노', inst: True },
  { id: 'classical-orch', genre: 'Classical', sub: 'Orchestral', mood: 'epic', bpm: 100, instruments: ['orchestra'], vocal: 'auto', desc: '오케스트라', icon: '🎻', label: '오케스트라', inst: True },
  { id: 'ambient-space', genre: 'Ambient', mood: 'ethereal', bpm: 60, instruments: ['pad', 'reverb'], vocal: 'auto', desc: '우주 앰비언트', icon: '🌌', label: '우주 앰비언트', inst: True },
  { id: 'ambient-nature', genre: 'Ambient', mood: 'peaceful', bpm: 65, instruments: ['nature', 'synth pad'], vocal: 'auto', desc: '자연 앰비언트', icon: '🌿', label: '자연 앰비언트', inst: True },
  { id: 'pop-dance', genre: 'Pop', sub: 'Dance Pop', mood: 'fun', bpm: 118, instruments: ['synth', 'clap', 'bass'], vocal: 'female', desc: '댄스 팝', icon: '💃', label: '댄스 팝' },
  { id: 'pop-acoustic', genre: 'Pop', sub: 'Acoustic', mood: 'warm', bpm: 95, instruments: ['acoustic guitar', 'cajon'], vocal: 'auto', desc: '어쿠스틱 팝', icon: '🎶', label: '어쿠스틱 팝' },
  { id: 'reggaeton', genre: 'Reggaeton', mood: 'hot', bpm: 96, instruments: ['dembow', 'synth'], vocal: 'male', desc: '레게톤', icon: '🌴', label: '레게톤' },
  { id: 'country', genre: 'Country', mood: 'warm', bpm: 105, instruments: ['banjo', 'acoustic guitar', 'fiddle'], vocal: 'auto', desc: '컨트리', icon: '🤠', label: '컨트리' },
  { id: 'folk', genre: 'Folk', mood: 'cozy', bpm: 100, instruments: ['acoustic guitar', 'harmonica'], vocal: 'auto', desc: '포크', icon: '🍂', label: '포크' },
  { id: 'cinematic', genre: 'Cinematic', mood: 'epic', bpm: 90, instruments: ['orchestra', 'choir', 'percussion'], vocal: 'auto', desc: '시네마틱', icon: '🎬', label: '시네마틱', inst: True },
  { id: 'meditation', genre: 'New Age', mood: 'peaceful', bpm: 55, instruments: ['singing bowl', 'pad'], vocal: 'auto', desc: '명상', icon: '🧘', label: '명상', inst: True },
];

export function getPresetsByCategory(categoryId: string): Preset[] {
  const map: Record<string, string[]> = {
    popular: ['kpop-bright', 'ballad-sad', 'hiphop-trap', 'edm-house', 'lofi-chill', 'pop-dance'],
    dance: ['kpop-powerful', 'edm-house', 'edm-future', 'pop-dance', 'reggaeton'],
    vocal: ['ballad-sad', 'ballad-warm', 'rnb-smooth', 'kpop-bright', 'jazz-bossa', 'pop-acoustic'],
    inst: ['lofi-chill', 'lofi-rain', 'classical-piano', 'classical-orch', 'ambient-space', 'cinematic', 'meditation'],
    mood: ['ambient-nature', 'ambient-space', 'lofi-rain', 'jazz-smooth', 'folk', 'meditation'],
  };
  const ids = map[categoryId] ?? [];
  return ids.map((id) => PRESETS.find((p) => p.id === id)!).filter(Boolean);
}
