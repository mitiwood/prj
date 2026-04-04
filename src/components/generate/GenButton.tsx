import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  label: string;
  icon: ReactNode;
}

export function GenButton({ onClick, disabled, loading, label, icon }: Props) {
  return (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-3.5 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 transition-all ${
        disabled
          ? 'bg-muted text-muted-foreground cursor-not-allowed'
          : 'bg-gradient-to-r from-purple-600 to-purple-500 shadow-lg shadow-purple-500/30'
      }`}
    >
      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
      {loading ? '생성 중...' : label}
    </motion.button>
  );
}
