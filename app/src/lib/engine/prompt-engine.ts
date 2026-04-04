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
  return parts.join(', ');
}
