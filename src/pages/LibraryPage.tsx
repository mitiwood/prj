import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Play, Pause, Trash2, Download, MoreHorizontal, X } from 'lucide-react';
import { useStore } from '../stores/useStore';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { Sheet } from '../components/ui/Sheet';
import type { Track } from '../types';

export function LibraryPage() {
  const { history, removeTrack } = useStore();
  const { play, currentTrack, isPlaying } = useAudioPlayer();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [detailTrack, setDetailTrack] = useState<Track | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filters = [
    { key: 'all', label: '전체' },
    { key: 'custom', label: '커스텀' },
    { key: 'simple', label: '심플' },
    { key: 'youtube', label: 'YouTube' },
  ];

  const filteredTracks = useMemo(() => {
    return history.filter((t) => {
      if (filter !== 'all' && t.genMode !== filter) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.tags?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [history, search, filter]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const deleteSelected = () => {
    selected.forEach((id) => removeTrack(id));
    setSelected(new Set());
    setSelectMode(false);
  };

  const handleDownload = (track: Track) => {
    const a = document.createElement('a');
    a.href = track.audio_url;
    a.download = `${track.title || 'track'}.mp3`;
    a.click();
  };

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">내 보관함</h1>
        <div className="flex gap-2">
          {selectMode && selected.size > 0 && (
            <button onClick={deleteSelected} className="text-xs px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg">
              {selected.size}개 삭제
            </button>
          )}
          <button onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}
            className="text-xs px-3 py-1.5 bg-secondary text-muted-foreground rounded-lg">
            {selectMode ? '취소' : '선택'}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-secondary text-sm outline-none pl-9 pr-4 py-2.5 rounded-xl placeholder:text-muted-foreground"
          placeholder="곡 이름, 태그 검색..." />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {filters.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f.key ? 'bg-purple-600 text-white' : 'bg-secondary text-muted-foreground'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mb-3">{filteredTracks.length}곡</p>

      {filteredTracks.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📂</p>
          <p className="text-sm text-muted-foreground">{search ? '검색 결과가 없어요' : '아직 생성한 곡이 없어요'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTracks.map((track, i) => {
            const playing = currentTrack?.id === track.id && isPlaying;
            return (
              <motion.div key={track.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all ${playing ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-card border border-border'}`}>
                {selectMode && (
                  <button onClick={() => toggleSelect(track.id)}
                    className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${selected.has(track.id) ? 'bg-purple-600 border-purple-600 text-white' : 'border-muted-foreground'}`}>
                    {selected.has(track.id) && '✓'}
                  </button>
                )}
                <div onClick={() => play(track)} className="w-10 h-10 rounded-lg overflow-hidden bg-secondary flex-shrink-0 cursor-pointer">
                  {track.image_url ? <img src={track.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">🎵</div>}
                </div>
                <div onClick={() => play(track)} className="flex-1 min-w-0 cursor-pointer">
                  <p className="text-sm font-semibold truncate">{track.title}</p>
                  <p className="text-xs text-muted-foreground">{track.genMode} · {track.model || 'V4'}</p>
                </div>
                {!selectMode && (
                  <button onClick={() => setDetailTrack(track)} className="text-muted-foreground">
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!detailTrack} onClose={() => setDetailTrack(null)} title={detailTrack?.title}>
        {detailTrack && (
          <div className="space-y-3">
            {detailTrack.image_url && <img src={detailTrack.image_url} alt="" className="w-full h-40 object-cover rounded-xl" />}
            <div className="text-sm space-y-1">
              <p><span className="text-muted-foreground">모드:</span> {detailTrack.genMode}</p>
              <p><span className="text-muted-foreground">모델:</span> {detailTrack.model || 'V4'}</p>
              <p><span className="text-muted-foreground">태그:</span> {detailTrack.tags}</p>
              {detailTrack.duration && <p><span className="text-muted-foreground">길이:</span> {Math.round(detailTrack.duration)}초</p>}
            </div>
            {detailTrack.lyrics && (
              <div>
                <p className="text-sm font-bold mb-1">가사</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap max-h-[200px] overflow-y-auto bg-secondary p-3 rounded-xl">{detailTrack.lyrics}</p>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button onClick={() => { play(detailTrack); setDetailTrack(null); }}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                <Play className="w-4 h-4" /> 재생
              </button>
              <button onClick={() => handleDownload(detailTrack)}
                className="py-2.5 px-4 bg-secondary rounded-xl text-sm">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={() => { removeTrack(detailTrack.id); setDetailTrack(null); }}
                className="py-2.5 px-4 bg-red-500/10 text-red-400 rounded-xl text-sm">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
