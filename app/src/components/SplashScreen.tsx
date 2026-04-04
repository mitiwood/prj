import { useEffect } from 'react';
import { motion } from 'framer-motion';

interface Props {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: Props) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-purple-700 via-violet-600 to-indigo-800"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 12 }}
        className="text-center"
      >
        <motion.h1
          className="text-5xl font-black text-white mb-2"
          animate={{ y: [0, -8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          띵곡
        </motion.h1>
        <p className="text-white/70 text-sm">AI Music Studio</p>
      </motion.div>
    </motion.div>
  );
}
