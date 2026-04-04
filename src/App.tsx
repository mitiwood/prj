import { useState, useCallback, useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { SplashScreen } from './components/SplashScreen';
import { Layout } from './components/Layout';
import { useTheme } from './hooks/useTheme';
import { MiniPlayer } from './components/MiniPlayer';
import { GeneratingOverlay } from './components/GeneratingOverlay';
import { ToastContainer } from './components/ui/Toast';
import { CreatePage } from './pages/CreatePage';
import { CommunityPage } from './pages/CommunityPage';
import { LibraryPage } from './pages/LibraryPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProfilePage } from './pages/ProfilePage';
import { useStore } from './stores/useStore';
import { fetchApiKey, fetchToken } from './lib/api';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <CreatePage /> },
      { path: 'community', element: <CommunityPage /> },
      { path: 'library', element: <LibraryPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'profile/:id', element: <ProfilePage /> },
    ],
  },
]);

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const handleComplete = useCallback(() => setShowSplash(false), []);
  const setApiKey = useStore((s) => s.setApiKey);
  const setUser = useStore((s) => s.setUser);
  useTheme();

  useEffect(() => {
    fetchApiKey().then((key) => { if (key) setApiKey(key); });
  }, [setApiKey]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === 'ok') {
      const user = {
        name: params.get('name') || '',
        email: params.get('email') || '',
        avatar: params.get('avatar') || '',
        provider: params.get('provider') || '',
      };
      setUser(user);
      fetchToken(user);
      window.history.replaceState({}, '', '/');
    }
  }, [setUser]);

  return (
    <div className="size-full">
      <AnimatePresence>
        {showSplash && <SplashScreen onComplete={handleComplete} />}
      </AnimatePresence>
      {!showSplash && (
        <>
          <RouterProvider router={router} />
          <MiniPlayer />
          <GeneratingOverlay />
          <ToastContainer />
        </>
      )}
    </div>
  );
}
