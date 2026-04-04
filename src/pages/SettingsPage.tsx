import { useState } from 'react';
import { motion } from 'framer-motion';
import { Moon, Sun, Bell, Shield, LogOut, User, CreditCard, ChevronRight, Calendar, Trash2 } from 'lucide-react';
import { useStore } from '../stores/useStore';
import { Sheet } from '../components/ui/Sheet';
import type { ThemeMode } from '../stores/slices/uiSlice';

export function SettingsPage() {
  const { user, setUser, theme, setTheme, addToast } = useStore();
  const [planSheet, setPlanSheet] = useState(false);
  const [attendanceSheet, setAttendanceSheet] = useState(false);

  const handleTheme = (t: ThemeMode) => {
    setTheme(t);
    if (t === 'dark') document.documentElement.classList.add('dark');
    else if (t === 'light') document.documentElement.classList.remove('dark');
    else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('kms_jwt');
    localStorage.removeItem('kms_session_id');
    addToast('로그아웃 되었습니다', 'ok');
  };

  const handleClearCache = () => {
    localStorage.removeItem('kms-store');
    addToast('캐시가 삭제되었습니다. 새로고침해주세요.', 'ok');
  };

  return (
    <div className="py-4">
      <h1 className="text-lg font-bold mb-5">설정</h1>

      {/* Profile card */}
      {user ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl border border-border p-5 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-secondary overflow-hidden">
              {user.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl">👤</div>}
            </div>
            <div>
              <p className="font-bold">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.provider} · {user.plan || 'Free'}</p>
            </div>
          </div>
        </motion.div>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-5 mb-5 text-center">
          <p className="text-sm text-muted-foreground mb-3">로그인하면 더 많은 기능을 사용할 수 있어요</p>
          <button onClick={() => useStore.getState().setLoginSheetOpen(true)}
            className="px-6 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold">로그인</button>
        </div>
      )}

      {/* Theme */}
      <div className="bg-card rounded-2xl border border-border p-5 mb-4">
        <p className="text-sm font-bold mb-3">🎨 테마</p>
        <div className="flex gap-2">
          {([['dark', '다크', Moon], ['light', '라이트', Sun], ['system', '시스템', Sun]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => handleTheme(key as ThemeMode)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all ${
                theme === key ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-secondary text-muted-foreground border border-transparent'
              }`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Menu items */}
      <div className="bg-card rounded-2xl border border-border divide-y divide-border mb-4">
        <MenuItem icon={<CreditCard className="w-5 h-5 text-purple-400" />} label="플랜 관리" onClick={() => setPlanSheet(true)} />
        <MenuItem icon={<Calendar className="w-5 h-5 text-green-400" />} label="출석 체크" onClick={() => setAttendanceSheet(true)} />
        <MenuItem icon={<Bell className="w-5 h-5 text-blue-400" />} label="알림 설정" onClick={() => addToast('알림 설정은 준비 중이에요', 'info')} />
        <MenuItem icon={<Shield className="w-5 h-5 text-orange-400" />} label="개인정보 처리방침" onClick={() => window.open('https://ddinggok.com/privacy', '_blank')} />
      </div>

      <div className="bg-card rounded-2xl border border-border divide-y divide-border mb-4">
        <MenuItem icon={<Trash2 className="w-5 h-5 text-red-400" />} label="캐시 삭제" onClick={handleClearCache} />
        {user && <MenuItem icon={<LogOut className="w-5 h-5 text-red-400" />} label="로그아웃" onClick={handleLogout} danger />}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">띵곡 AI Music Studio v4.0</p>

      {/* Plan Sheet */}
      <Sheet open={planSheet} onClose={() => setPlanSheet(false)} title="플랜 관리">
        <div className="space-y-3">
          {[
            { name: 'Free', price: '무료', features: ['월 5곡 생성', 'V3.5~V4 모델', '기본 커뮤니티'] },
            { name: 'Pro', price: '₩9,900/월', features: ['월 50곡 생성', '모든 모델', 'MV 생성', '우선 큐'] },
            { name: 'Premium', price: '₩19,900/월', features: ['무제한 생성', '모든 기능', '보컬 리무버', 'API 액세스'] },
          ].map((plan) => (
            <div key={plan.name} className={`p-4 rounded-xl border ${user?.plan === plan.name ? 'border-purple-500 bg-purple-500/5' : 'border-border'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold">{plan.name}</span>
                <span className="text-sm text-purple-400 font-semibold">{plan.price}</span>
              </div>
              <ul className="space-y-1">
                {plan.features.map((f) => <li key={f} className="text-xs text-muted-foreground">✓ {f}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </Sheet>

      {/* Attendance Sheet */}
      <Sheet open={attendanceSheet} onClose={() => setAttendanceSheet(false)} title="출석 체크">
        <div className="text-center py-8">
          <p className="text-5xl mb-4">📅</p>
          <p className="text-sm text-muted-foreground mb-4">매일 출석하면 보너스 크레딧을 받아요!</p>
          <button onClick={() => {
            fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userName: user?.name, userProvider: user?.provider }) })
              .then((r) => r.json())
              .then((d) => addToast(d.message || '출석 완료!', d.ok ? 'ok' : 'err'))
              .catch(() => addToast('출석 실패', 'err'));
          }} className="px-8 py-3 bg-purple-600 text-white rounded-xl font-bold" disabled={!user}>
            출석하기
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-secondary/50 transition-colors">
      {icon}
      <span className={`text-sm font-medium flex-1 text-left ${danger ? 'text-red-400' : ''}`}>{label}</span>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </button>
  );
}
