import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import LoginSheet from '../auth/LoginSheet';
import { useStore } from '../../stores/useStore';
import { User, Bell } from 'lucide-react';

export default function Layout() {
  const user = useStore((s) => s.user);
  const setLoginSheetOpen = useStore((s) => s.setLoginSheetOpen);

  return (
    <div className="min-h-screen bg-[var(--bg)] max-w-[480px] mx-auto relative">
      <header className="sticky top-0 z-50 bg-[var(--bg)]/80 backdrop-blur-lg border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-black bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
          띵곡
        </h1>
        <div className="flex items-center gap-3">
          <button className="p-2 rounded-full hover:bg-[var(--border)] transition">
            <Bell size={20} className="text-[var(--t2)]" />
          </button>
          {user ? (
            <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-[var(--acc)]">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-[var(--acc)] flex items-center justify-center">
                  <span className="text-white text-xs font-bold">
                    {user.name[0]}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setLoginSheetOpen(true)}
              className="p-2 rounded-full hover:bg-[var(--border)] transition"
            >
              <User size={20} className="text-[var(--t2)]" />
            </button>
          )}
        </div>
      </header>

      <main className="pb-40">
        <Outlet />
      </main>

      <BottomNav />
      <LoginSheet />
    </div>
  );
}
