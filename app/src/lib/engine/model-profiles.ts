export interface ModelProfile {
  id: string;
  name: string;
  speed: number;
  quality: number;
  maxDuration: number;
  credits: number;
  desc: string;
  strengths: string[];
  bestFor: string[];
}

export const MODEL_PROFILES: Record<string, ModelProfile> = {
  V3_5: {
    id: 'V3_5',
    name: 'V3.5',
    speed: 5,
    quality: 3,
    maxDuration: 240,
    credits: 1,
    desc: '빠른 생성, 기본 품질',
    strengths: ['빠른 속도', '저크레딧'],
    bestFor: ['테스트', '빠른 작곡'],
  },
  V4: {
    id: 'V4',
    name: 'V4',
    speed: 4,
    quality: 4,
    maxDuration: 240,
    credits: 2,
    desc: '균형 잡힌 속도와 품질',
    strengths: ['안정적', '다양한 장르'],
    bestFor: ['팝', 'K-Pop', '일반'],
  },
  V4_5: {
    id: 'V4_5',
    name: 'V4.5',
    speed: 3,
    quality: 5,
    maxDuration: 300,
    credits: 3,
    desc: '고품질 음악 생성',
    strengths: ['높은 품질', '풍부한 사운드'],
    bestFor: ['발라드', 'R&B', 'OST'],
  },
  V4_5PLUS: {
    id: 'V4_5PLUS',
    name: 'V4.5+',
    speed: 2,
    quality: 5,
    maxDuration: 360,
    credits: 5,
    desc: '최고 품질, 긴 곡 가능',
    strengths: ['최고 품질', '긴 길이'],
    bestFor: ['클래식', '앰비언트', '프로'],
  },
  V5: {
    id: 'V5',
    name: 'V5',
    speed: 2,
    quality: 5,
    maxDuration: 300,
    credits: 4,
    desc: '최신 모델, 최고 품질',
    strengths: ['최신', '자연스러운'],
    bestFor: ['모든 장르'],
  },
  LYRIA_PRO: {
    id: 'LYRIA_PRO',
    name: 'Lyria Pro',
    speed: 3,
    quality: 4,
    maxDuration: 120,
    credits: 2,
    desc: 'Google DeepMind 음악 모델',
    strengths: ['Google AI', '깨끗한 보컬'],
    bestFor: ['팝', '인디'],
  },
  LYRIA_CLIP: {
    id: 'LYRIA_CLIP',
    name: 'Lyria Clip',
    speed: 5,
    quality: 3,
    maxDuration: 30,
    credits: 1,
    desc: '짧은 클립 빠른 생성',
    strengths: ['초고속', '미리듣기용'],
    bestFor: ['쇼트', '효과음'],
  },
};

const GENRE_MODEL_MAP: Record<string, string> = {
  'K-Pop': 'V4',
  pop: 'V4',
  rock: 'V4_5',
  ballad: 'V4_5',
  rnb: 'V4_5',
  classical: 'V4_5PLUS',
  ambient: 'V4_5PLUS',
  edm: 'V4',
  hiphop: 'V4',
  jazz: 'V4_5',
  lofi: 'V3_5',
};

export function recommendModel(genre: string): string {
  const key = genre.toLowerCase().replace(/[- ]/g, '');
  return GENRE_MODEL_MAP[key] ?? 'V4';
}

export function getDefaultModel(isGuest: boolean): string {
  return isGuest ? 'V3_5' : 'V4';
}
