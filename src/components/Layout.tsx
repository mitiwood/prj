import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { LoginSheet } from './LoginSheet';
import { useStore } from '../stores/useStore';
import { Bell, LogIn } from 'lucide-react';

export function Layout() {
  const user = useStore((s) => s.user);
  const loginSheetOpen = useStore((s) => s.loginSheetOpen);
  const setLoginSheetOpen = useStore((s) => s.setLoginSheetOpen);

  return (
    <div className="min-h-screen max-w-[480px] mx-auto pb-20 relative bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 sticky top-0 z-[100] bg-background/90 backdrop-blur-xl border-b border-border">
        <div className="text-lg font-extrabold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
          띵곡
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{user.name}</span>
              {user.avatar && <img src={user.avatar} alt="" className="w-7 h-7 rounded-full" />}
            </div>
          ) : (
            <button onClick={() => setLoginSheetOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold">
              <LogIn className="w-3.5 h-3.5" /> 로그인
            </button>
          )}
          <button className="text-lg opacity-60 hover:opacity-100 transition-opacity">
            <Bell className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="px-4">
        <Outlet />
      </main>

      <BottomNav />
      <LoginSheet open={loginSheetOpen} onClose={() => setLoginSheetOpen(false)} />
    </div>
  );
}
