import { useState, useEffect } from 'react';
import Sheet from '../ui/Sheet';
import { useStore } from '../../stores/useStore';
import { fetchJson, API_BASE } from '../../lib/api';
import { Send } from 'lucide-react';

interface Comment {
  id: string;
  user_name: string;
  user_avatar?: string;
  text: string;
  created: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  trackId: string;
}

export default function CommentSheet({ open, onClose, trackId }: Props) {
  const user = useStore((s) => s.user);
  const addToast = useStore((s) => s.addToast);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !trackId) return;
    fetchJson<Comment[]>(`${API_BASE}/comments?trackId=${trackId}`)
      .then(setComments)
      .catch(() => {});
  }, [open, trackId]);

  const submit = async () => {
    if (!text.trim() || !user) return;
    setLoading(true);
    try {
      await fetchJson(`${API_BASE}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackId,
          text: text.trim(),
          user: { name: user.name, provider: user.provider },
        }),
      });
      setText('');
      const updated = await fetchJson<Comment[]>(
        `${API_BASE}/comments?trackId=${trackId}`,
      );
      setComments(updated);
    } catch {
      addToast('댓글 작성에 실패했습니다', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={`댓글 (${comments.length})`}>
      <div className="space-y-3 max-h-[50vh] overflow-y-auto mb-4">
        {comments.length === 0 && (
          <p className="text-sm text-[var(--t3)] text-center py-4">
            아직 댓글이 없습니다
          </p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2">
            <div className="w-7 h-7 rounded-full bg-[var(--border)] shrink-0 overflow-hidden">
              {c.user_avatar ? (
                <img
                  src={c.user_avatar}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : null}
            </div>
            <div>
              <span className="text-xs font-semibold text-[var(--t1)]">
                {c.user_name}
              </span>
              <p className="text-sm text-[var(--t2)]">{c.text}</p>
            </div>
          </div>
        ))}
      </div>
      {user && (
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="댓글을 입력하세요"
            className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--t1)] placeholder-[var(--t3)] outline-none focus:border-[var(--acc)]"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <button
            onClick={submit}
            disabled={loading || !text.trim()}
            className="p-2 rounded-lg bg-[var(--acc)] text-white disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      )}
    </Sheet>
  );
}
