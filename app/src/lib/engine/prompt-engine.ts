const GENRE_MAP: Record<string, string> = {
  '케이팝': 'K-Pop',
  '발라드': 'Ballad',
  '힙합': 'Hip-Hop',
  '알앤비': 'R&B',
  '재즈': 'Jazz',
  '록': 'Rock',
  '클래식': 'Classical',
  '앰비언트': 'Ambient',
  '로파이': 'Lo-Fi',
  '팝': 'Pop',
  '컨트리': 'Country',
  '레게톤': 'Reggaeton',
  '포크': 'Folk',
  '트랩': 'Trap',
  '하우스': 'House',
  '인디': 'Indie',
};

const MOOD_MAP: Record<string, string> = {
  '밝은': 'bright',
  '어두운': 'dark',
  '슬픈': 'sad',
  '신나는': 'energetic',
  '편안한': 'chill',
  '따뜻한': 'warm',
  '강렬한': 'powerful',
  '몽환적': 'dreamy',
  '서정적': 'lyrical',
  '감성적': 'emotional',
  '웅장한': 'epic',
  '잔잔한': 'calm',
  '행복한': 'happy',
  '우울한': 'melancholic',
  '로맨틱': 'romantic',
};

const TEMPO_MAP: Record<string, number> = {
  '느린': 70,
  '느리게': 70,
  '보통': 100,
  '빠른': 130,
  '빠르게': 130,
  '아주빠른': 160,
  slow: 70,
  medium: 100,
  fast: 130,
  'very fast': 160,
};

export interface ParsedInput {
  genres: string[];
  moods: string[];
  tempo?: number;
}

export function parseNaturalLanguage(text: string): ParsedInput {
  const lower = text.toLowerCase();
  const genres: string[] = [];
  const moods: string[] = [];
  let tempo: number | undefined;

  for (const [ko, en] of Object.entries(GENRE_MAP)) {
    if (lower.includes(ko) || lower.includes(en.toLowerCase())) genres.push(en);
  }
  for (const [ko, en] of Object.entries(MOOD_MAP)) {
    if (lower.includes(ko) || lower.includes(en)) moods.push(en);
  }
  for (const [word, bpm] of Object.entries(TEMPO_MAP)) {
    if (lower.includes(word)) {
      tempo = bpm;
      break;
    }
  }

  const bpmMatch = text.match(/(\d{2,3})\s*[bB][pP][mM]/);
  if (bpmMatch) tempo = parseInt(bpmMatch[1], 10);

  return { genres, moods, tempo };
}

interface StyleInput {
  genre?: string;
  sub?: string;
  mood?: string;
  bpm?: number;
  vocal?: string;
  instruments?: string[];
  negative?: string;
}

export function buildStyleString(input: StyleInput): string {
  const parts: string[] = [];
  if (input.genre) parts.push(input.genre);
  if (input.sub) parts.push(input.sub);
  if (input.mood) parts.push(input.mood);
  if (input.bpm) parts.push(`${input.bpm}BPM`);
  if (input.vocal && input.vocal !== 'auto') parts.push(`${input.vocal} vocal`);
  if (input.instruments?.length) parts.push(input.instruments.join(', '));
  if (input.negative) parts.push(`[negative: ${input.negative}]`);

  /* 보컬 스타일 힌트 자동 삽입 */
  const vocalHint = getVocalHint(parts.join(' ').toLowerCase(), input.mood?.toLowerCase() || '', input.vocal || '');
  if (vocalHint) parts.unshift(vocalHint);

  return parts.join(', ');
}

function getVocalHint(style: string, mood: string, vocal: string): string {
  const hints: string[] = [];

  if (/ballad/.test(style)) hints.push('emotional vocal, wide vocal range, dynamic expression');
  else if (/hip-?hop|rap|trap/.test(style)) hints.push('rhythmic vocal flow, confident delivery');
  else if (/r&b|soul/.test(style)) hints.push('smooth soulful vocal, warm tone');
  else if (/rock|punk|metal/.test(style)) hints.push('powerful vocal, raw energy');
  else if (/jazz/.test(style)) hints.push('smooth jazz vocal, improvisational phrasing');
  else if (/edm|electronic|dance|house/.test(style)) hints.push('catchy vocal hook, energetic chant');
  else if (/lo-?fi|chill|ambient/.test(style)) hints.push('soft breathy vocal, intimate tone');
  else if (/k-?pop|pop/.test(style)) hints.push('clear bright vocal, catchy melodic hook');
  else if (/trot/.test(style)) hints.push('vibrato vocal, expressive Korean trot singing');
  else if (/classical|cinematic/.test(style)) hints.push('operatic vocal, grand dynamic range');
  else if (/acoustic|folk/.test(style)) hints.push('warm natural vocal, intimate feel');
  else hints.push('expressive vocal, clear tone');

  if (/sad|emotional|melanchol/.test(mood)) hints.push('heartfelt delivery');
  else if (/energetic|hype|upbeat/.test(mood)) hints.push('high energy performance');
  else if (/calm|relax/.test(mood)) hints.push('gentle soothing voice');
  else if (/dark|intense/.test(mood)) hints.push('deep intense character');

  if (vocal === 'f') hints.push('female vocalist');
  else if (vocal === 'm') hints.push('male vocalist');

  return hints.join(', ');
}
