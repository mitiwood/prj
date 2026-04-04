import { motion } from 'framer-motion';
import { useStore } from '../stores/useStore';
import { X } from 'lucide-react';

export default function GeneratingOverlay() {
  const isGenerating = useStore((s) => s.isGenerating);
  const progress = useStore((s) => s.genProgress);
  const status = useStore((s) => s.genStatus);
  const eta = useStore((s) => s.genEta);
  const cancelGen = useStore((s) => s.cancelGen);

  if (!isGenerating) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center"
    >
      <div className="bg-[var(--card)] rounded-2xl p-6 mx-4 max-w-sm w-full text-center">
        <div className="mb-4">
          <motion.div
            className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-purple-500 to-indigo-600"
            animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
            transition={{ repeat: Infinity, duration: 2 }}
          />
        </div>
        <p className="text-[var(--t1)] font-semibold mb-1">
          {status || 'AI가 작곡 중...'}
        </p>
        {eta > 0 && (
          <p className="text-[var(--t3)] text-sm mb-3">
            예상 시간: {Math.ceil(eta)}초
          </p>
        )}
        <div className="w-full bg-[var(--border)] rounded-full h-2 mb-4">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <p className="text-[var(--t2)] text-xs mb-4">{Math.round(progress)}%</p>
        <button
          onClick={cancelGen}
          className="flex items-center gap-1 mx-auto px-4 py-2 rounded-full text-sm text-red-400 hover:bg-red-400/10 transition"
        >
          <X size={16} /> 취소
        </button>
      </div>
    </motion.div>
  );
}
