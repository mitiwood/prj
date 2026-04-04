interface Props {
  lyrics?: string;
  progress?: number;
}

export default function LyricsView({ lyrics }: Props) {
  if (!lyrics) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[var(--t3)] text-sm">가사가 없습니다</p>
      </div>
    );
  }

  const lines = lyrics.split('\n').filter(Boolean);

  return (
    <div className="flex-1 overflow-y-auto px-8 py-4">
      <div className="space-y-4">
        {lines.map((line, i) => (
          <p
            key={i}
            className="text-center text-base text-[var(--t2)] leading-relaxed transition"
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
