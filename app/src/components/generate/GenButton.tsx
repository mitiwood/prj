import { motion } from 'framer-motion';
import { Sparkles, Loader2 } from 'lucide-react';

interface Props {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
}

export default function GenButton({
  onClick,
  disabled,
  loading,
  label = 'AI 작곡 시작',
}: Props) {
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full py-4 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 shadow-lg shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base transition"
    >
      {loading ? (
        <Loader2 size={20} className="animate-spin" />
      ) : (
        <Sparkles size={20} />
      )}
      {loading ? '생성 중...' : label}
    </motion.button>
  );
}
