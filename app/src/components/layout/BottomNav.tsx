import { NavLink } from 'react-router-dom';
import { Music, Users, Library, Settings } from 'lucide-react';
import { clsx } from 'clsx';

const tabs = [
  { to: '/', icon: Music, label: '만들기' },
  { to: '/community', icon: Users, label: '커뮤니티' },
  { to: '/library', icon: Library, label: '보관함' },
  { to: '/settings', icon: Settings, label: '설정' },
];

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-[var(--card)]/90 backdrop-blur-lg border-t border-[var(--border)] z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around py-2">
        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors',
                isActive
                  ? 'text-[var(--acc)]'
                  : 'text-[var(--t3)] hover:text-[var(--t2)]',
              )
            }
          >
            <Icon size={22} />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
