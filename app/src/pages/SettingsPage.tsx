import { useStore } from '../stores/useStore';
import { useTheme } from '../hooks/useTheme';
import {
  Moon,
  Sun,
  Crown,
  CalendarCheck,
  Bell,
  Shield,
  Trash2,
  LogOut,
} from 'lucide-react';

export default function SettingsPage() {
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const addToast = useStore((s) => s.addToast);
  const { theme, toggle } = useTheme();

  const handleLogout = () => {
    setUser(null);
    addToast('로그아웃되었습니다', 'info');
  };

  const clearCache = () => {
    localStorage.removeItem('ddinggok-v4-store');
    addToast('캐시가 삭제되었습니다', 'success');
    window.location.reload();
  };

  return (
    <div className="p-4 space-y-4">
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 flex items-center gap-3">
        <div className="w-14 h-14 rounded-full overflow-hidden bg-[var(--border)]">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center">
              <span className="text-white text-xl font-bold">
                {user?.name?.[0] ?? '?'}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1">
          <p className="text-base font-bold text-[var(--t1)]">
            {user?.name ?? '게스트'}
          </p>
          <p className="text-xs text-[var(--t3)]">
            {user?.provider ?? '로그인이 필요합니다'}
          </p>
          {user?.plan && (
            <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] bg-[var(--acc)]/20 text-[var(--acc)] font-medium">
              {user.plan}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={toggle}
        className="w-full bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          {theme === 'dark' ? (
            <Moon size={20} className="text-[var(--t2)]" />
          ) : (
            <Sun size={20} className="text-yellow-500" />
          )}
          <span className="text-sm text-[var(--t1)]">테마</span>
        </div>
        <span className="text-xs text-[var(--t3)]">
          {theme === 'dark' ? '다크' : '라이트'}
        </span>
      </button>

      {[
        { icon: Crown, label: '플랜 관리', color: 'text-yellow-500' },
        { icon: CalendarCheck, label: '출석 체크', color: 'text-green-500' },
        { icon: Bell, label: '알림 설정', color: 'text-blue-500' },
        {
          icon: Shield,
          label: '개인정보 처리방침',
          color: 'text-[var(--t2)]',
        },
      ].map(({ icon: Icon, label, color }) => (
        <button
          key={label}
          className="w-full bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 flex items-center gap-3"
        >
          <Icon size={20} className={color} />
          <span className="text-sm text-[var(--t1)]">{label}</span>
        </button>
      ))}

      <button
        onClick={clearCache}
        className="w-full bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 flex items-center gap-3"
      >
        <Trash2 size={20} className="text-orange-500" />
        <span className="text-sm text-[var(--t1)]">캐시 삭제</span>
      </button>

      {user && (
        <button
          onClick={handleLogout}
          className="w-full bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 flex items-center gap-3"
        >
          <LogOut size={20} className="text-red-400" />
          <span className="text-sm text-red-400">로그아웃</span>
        </button>
      )}

      <p className="text-center text-[10px] text-[var(--t3)] pt-4">
        띵곡 v4.0 · ddinggok.com
      </p>
    </div>
  );
}
