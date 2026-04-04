import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track, User } from '../types';

interface ToastItem {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

interface StoreState {
  user: User | null;
  guestMode: boolean;
  guestUsage: number;
  setUser: (u: User | null) => void;
  setGuestMode: (v: boolean) => void;
  incGuestUsage: () => void;
  isGuest: () => boolean;

  currentTrack: Track | null;
  queue: Track[];
  isPlaying: boolean;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  volume: number;
  progress: number;
  duration: number;
  setCurrentTrack: (t: Track | null) => void;
  setQueue: (q: Track[]) => void;
  setIsPlaying: (v: boolean) => void;
  setProgress: (v: number) => void;
  setDuration: (v: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  nextTrack: () => void;
  prevTrack: () => void;

  isGenerating: boolean;
  genProgress: number;
  genStatus: string;
  genEta: number;
  genTaskId: string;
  genMode: string;
  genModel: string;
  genCancelled: boolean;
  setIsGenerating: (v: boolean) => void;
  setGenProgress: (v: number) => void;
  setGenStatus: (s: string) => void;
  setGenEta: (v: number) => void;
  setGenTaskId: (id: string) => void;
  setGenMode: (m: string) => void;
  setGenModel: (m: string) => void;
  setGenCancelled: (v: boolean) => void;
  cancelGen: () => void;

  theme: 'dark' | 'light' | 'system';
  apiKey: string;
  toasts: ToastItem[];
  loginSheetOpen: boolean;
  setTheme: (t: 'dark' | 'light' | 'system') => void;
  setApiKey: (k: string) => void;
  addToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  removeToast: (id: string) => void;
  setLoginSheetOpen: (v: boolean) => void;

  history: Track[];
  addTrack: (t: Track) => void;
  removeTrack: (id: string) => void;
  setHistory: (h: Track[]) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      user: null,
      guestMode: false,
      guestUsage: 0,
      setUser: (u) => set({ user: u }),
      setGuestMode: (v) => set({ guestMode: v }),
      incGuestUsage: () => set((s) => ({ guestUsage: s.guestUsage + 1 })),
      isGuest: () => !get().user,

      currentTrack: null,
      queue: [],
      isPlaying: false,
      shuffle: false,
      repeat: 'off',
      volume: 1,
      progress: 0,
      duration: 0,
      setCurrentTrack: (t) => set({ currentTrack: t }),
      setQueue: (q) => set({ queue: q }),
      setIsPlaying: (v) => set({ isPlaying: v }),
      setProgress: (v) => set({ progress: v }),
      setDuration: (v) => set({ duration: v }),
      setVolume: (v) => set({ volume: v }),
      toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
      toggleRepeat: () =>
        set((s) => ({
          repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off',
        })),
      nextTrack: () => {
        const { queue, currentTrack, shuffle, repeat } = get();
        if (!queue.length) return;
        const idx = queue.findIndex((t) => t.id === currentTrack?.id);
        if (shuffle) {
          const next = queue[Math.floor(Math.random() * queue.length)];
          set({ currentTrack: next });
        } else if (idx < queue.length - 1) {
          set({ currentTrack: queue[idx + 1] });
        } else if (repeat === 'all') {
          set({ currentTrack: queue[0] });
        }
      },
      prevTrack: () => {
        const { queue, currentTrack } = get();
        if (!queue.length) return;
        const idx = queue.findIndex((t) => t.id === currentTrack?.id);
        if (idx > 0) set({ currentTrack: queue[idx - 1] });
      },

      isGenerating: false,
      genProgress: 0,
      genStatus: '',
      genEta: 0,
      genTaskId: '',
      genMode: 'custom',
      genModel: 'V4',
      genCancelled: false,
      setIsGenerating: (v) => set({ isGenerating: v }),
      setGenProgress: (v) => set({ genProgress: v }),
      setGenStatus: (s) => set({ genStatus: s }),
      setGenEta: (v) => set({ genEta: v }),
      setGenTaskId: (id) => set({ genTaskId: id }),
      setGenMode: (m) => set({ genMode: m }),
      setGenModel: (m) => set({ genModel: m }),
      setGenCancelled: (v) => set({ genCancelled: v }),
      cancelGen: () =>
        set({ genCancelled: true, isGenerating: false, genProgress: 0, genStatus: '' }),

      theme: 'dark',
      apiKey: '',
      toasts: [],
      loginSheetOpen: false,
      setTheme: (t) => set({ theme: t }),
      setApiKey: (k) => set({ apiKey: k }),
      addToast: (msg, type = 'info') => {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
        set((s) => ({ toasts: [...s.toasts, { id, message: msg, type }] }));
        setTimeout(() => {
          set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
        }, 3000);
      },
      removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      setLoginSheetOpen: (v) => set({ loginSheetOpen: v }),

      history: [],
      addTrack: (t) => set((s) => ({ history: [t, ...s.history] })),
      removeTrack: (id) => set((s) => ({ history: s.history.filter((t) => t.id !== id) })),
      setHistory: (h) => set({ history: h }),
    }),
    {
      name: 'ddinggok-v4-store',
      partialize: (s) => ({
        user: s.user,
        history: s.history,
        theme: s.theme,
        guestMode: s.guestMode,
        guestUsage: s.guestUsage,
      }),
    },
  ),
);
