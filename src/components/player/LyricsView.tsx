import { useRef, useEffect } from 'react';

interface Props {
  lyrics: string;
  progress: number;
}

interface LrcLine {
  time: number;
  text: string;
}

function parseLrc(lyrics: string): LrcLine[] {
  const lines = lyrics.split('\n');
  const result: LrcLine[] = [];
  const regex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/;

  for (const line of lines) {
    const match = line.match(regex);
    if (match) {
      const min = parseInt(match[1]);
      const sec = parseInt(match[2]);
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0')) : 0;
      const time = min * 60 + sec + ms / 1000;
      const text = line.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();
      if (text) result.push({ time, text });
    } else if (line.trim()) {
      result.push({ time: -1, text: line.trim() });
    }
  }
  return result;
}

export function LyricsView({ lyrics, progress }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lines = parseLrc(lyrics);
  const hasTimestamp = lines.some((l) => l.time >= 0);

  const activeIdx = hasTimestamp
    ? lines.reduce((acc, l, i) => (l.time >= 0 && l.time <= progress ? i : acc), 0)
    : -1;

  useEffect(() => {
    if (activeIdx >= 0 && containerRef.current) {
      const el = containerRef.current.children[activeIdx] as HTMLElement;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIdx]);

  if (!lyrics.trim()) {
    return (
      <div className="flex-1 flex items-center justify-center px-8">
        <p className="text-muted-foreground text-sm">가사가 없습니다</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-8 py-4 space-y-3">
      {lines.map((line, i) => (
        <p
          key={i}
          className={`text-center transition-all duration-300 ${
            i === activeIdx
              ? 'text-lg font-bold text-purple-400 scale-105'
              : 'text-sm text-muted-foreground'
          }`}
        >
          {line.text}
        </p>
      ))}
    </div>
  );
}
