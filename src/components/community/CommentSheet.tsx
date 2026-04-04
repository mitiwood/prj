import { Sheet } from '../ui/Sheet';
import { useState, useEffect } from 'react';
import { Send } from 'lucide-react';
import { useStore } from '../../stores/useStore';
import { API_BASE } from '../../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  trackId: string;
}

interface Comment {
  id: string;
  user_name: string;
  user_avatar?: string;
  content: string;
  created_at: string;
}

export function CommentSheet({ open, onClose, trackId }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const user = useStore((s) => s.user);

  useEffect(() => {
    if (!open || !trackId) return;
    fetch(`${API_BASE}/comments?track_id=${trackId}`)
      .then((r) => r.json())
      .then((d) => setComments(d.comments || []))
      .catch(() => {});
  }, [open, trackId]);

  const handleSend = async () => {
    if (!text.trim() || !user) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: trackId, user_name: user.name, user_provider: user.provider, user_avatar: user.avatar, content: text.trim() }),
      });
      const data = await res.json();
      if (data.ok || data.comment) {
        setComments((prev) => [{ id: Date.now().toString(), user_name: user.name, user_avatar: user.avatar, content: text.trim(), created_at: new Date().toISOString() }, ...prev]);
        setText('');
      }
    } catch {} finally { setLoading(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="댓글">
      <div className="max-h-[50vh] overflow-y-auto space-y-3 mb-4">
        {comments.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">아직 댓글이 없어요</p>}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-secondary overflow-hidden flex-shrink-0">
              {c.user_avatar ? <img src={c.user_avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px]">👤</div>}
            </div>
            <div>
              <p className="text-xs font-semibold">{c.user_name}</p>
              <p className="text-sm text-foreground">{c.content}</p>
            </div>
          </div>
        ))}
      </div>
      {user ? (
        <div className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 bg-secondary text-sm outline-none px-4 py-2.5 rounded-xl placeholder:text-muted-foreground"
            placeholder="댓글을 입력하세요" />
          <button onClick={handleSend} disabled={loading || !text.trim()}
            className="px-4 py-2.5 bg-purple-600 text-white rounded-xl disabled:opacity-50">
            <Send className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">로그인 후 댓글을 작성할 수 있어요</p>
      )}
    </Sheet>
  );
}
