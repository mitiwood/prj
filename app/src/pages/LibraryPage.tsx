import { useState, useMemo } from 'react';
import { useStore } from '../stores/useStore';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { deleteTrack as apiDeleteTrack } from '../lib/api';
import Chip from '../components/ui/Chip';
import Sheet from '../components/ui/Sheet';
import { Search, Trash2, Play, Download } from 'lucide-react';
import type { Track } from '../types';

type Filter = 'all' | 'custom' | 'simple' | 'youtube';

export default function LibraryPage() {
  const history = useStore((s) => s.history);
  const removeTrack = useStore((s) => s.removeTrack);
  const user = useStore((s) => s.user);
  const addToast = useStore((s) => s.addToast);
  const { play } = useAudioPlayer();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailTrack, setDetailTrack] = useState<Track | null>(null);

  const filtered = useMemo(() => {
    let list = history;
    if (filter !== 'all')
      list = list.filter((t) => t.genMode === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.tags ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [history, filter, search]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkDelete = async () => {
    for (const id of selected) {
      if (user)
        await apiDeleteTrack(id, {
          name: user.name,
          provider: user.provider,
        }).catch(() => {});
      removeTrack(id);
    }
    setSelected(new Set());
    setSelectMode(false);
    addToast(`${selected.size}곡 삭제됨`, 'success');
  };

  const handleDelete = async (track: Track) => {
    if (user)
      await apiDeleteTrack(track.id, {
        name: user.name,
        provider: user.provider,
      }).catch(() => {});
    removeTrack(track.id);
    setDetailTrack(null);
    addToast('삭제되었습니다', 'success');
  };

  return (
    <div className="p-4 space-y-4">
      <div className="relative">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t3)]"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="검색"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--card)] border border-[var(--border)] text-sm text-[var(--t1)] placeholder-[var(--t3)] outline-none focus:border-[var(--acc)] transition"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['all', 'custom', 'simple', 'youtube'] as Filter[]).map((f) => (
            <Chip
              key={f}
              label={
                f === 'all'
                  ? '전체'
                  : f === 'custom'
                    ? '커스텀'
                    : f === 'simple'
                      ? '심플'
                      : 'YouTube'
              }
              active={filter === f}
              onClick={() => setFilter(f)}
            />
          ))}
        </div>
        <button
          onClick={() => {
            setSelectMode(!selectMode);
            setSelected(new Set());
          }}
          className="text-xs text-[var(--acc)]"
        >
          {selectMode ? '취소' : '선택'}
        </button>
      </div>

      {selectMode && selected.size > 0 && (
        <button
          onClick={bulkDelete}
          className="flex items-center gap-1 text-sm text-red-400"
        >
          <Trash2 size={14} /> {selected.size}곡 삭제
        </button>
      )}

      {filtered.length === 0 ? (
        <p className="text-center text-sm text-[var(--t3)] py-8">
          곡이 없습니다
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-[var(--card)] border border-[var(--border)] cursor-pointer"
              onClick={() =>
                selectMode ? toggleSelect(t.id) : setDetailTrack(t)
              }
            >
              {selectMode && (
                <div
                  className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                    selected.has(t.id)
                      ? 'border-[var(--acc)] bg-[var(--acc)]'
                      : 'border-[var(--t3)]'
                  }`}
                >
                  {selected.has(t.id) && (
                    <span className="text-white text-[10px]">✓</span>
                  )}
                </div>
              )}
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--border)] shrink-0">
                {t.image_url ? (
                  <img
                    src={t.image_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-purple-600 to-indigo-700" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--t1)] truncate">
                  {t.title}
                </p>
                <p className="text-[10px] text-[var(--t3)]">
                  {t.genMode ?? 'custom'} · {t.model ?? 'AI'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet
        open={!!detailTrack}
        onClose={() => setDetailTrack(null)}
        title={detailTrack?.title}
      >
        {detailTrack && (
          <div className="space-y-3">
            <div className="aspect-square rounded-xl overflow-hidden bg-[var(--border)] max-w-[200px] mx-auto">
              {detailTrack.image_url ? (
                <img
                  src={detailTrack.image_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-purple-600 to-indigo-700" />
              )}
            </div>
            {detailTrack.tags && (
              <p className="text-xs text-[var(--t3)] text-center">
                {detailTrack.tags}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  play(detailTrack, filtered);
                  setDetailTrack(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-[var(--acc)] text-white text-sm font-medium flex items-center justify-center gap-1"
              >
                <Play size={16} /> 재생
              </button>
              {detailTrack.audio_url && (
                <a
                  href={detailTrack.audio_url}
                  download
                  className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-[var(--t1)] text-sm font-medium flex items-center justify-center gap-1"
                >
                  <Download size={16} /> 다운로드
                </a>
              )}
            </div>
            <button
              onClick={() => handleDelete(detailTrack)}
              className="w-full py-2.5 rounded-xl text-red-400 text-sm font-medium flex items-center justify-center gap-1 hover:bg-red-400/10 transition"
            >
              <Trash2 size={16} /> 삭제
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
