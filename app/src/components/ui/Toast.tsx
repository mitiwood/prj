import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../stores/useStore';
import { X } from 'lucide-react';

const colorMap = {
  info: 'bg-blue-600',
  success: 'bg-green-600',
  error: 'bg-red-600',
};

export default function ToastContainer() {
  const toasts = useStore((s) => s.toasts);
  const removeToast = useStore((s) => s.removeToast);

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 80 }}
            className={`${colorMap[t.type]} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm`}
          >
            <span className="flex-1">{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="shrink-0">
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
