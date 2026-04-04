import { useState, useCallback } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/layout/Layout';
import CreatePage from './pages/CreatePage';
import CommunityPage from './pages/CommunityPage';
import LibraryPage from './pages/LibraryPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import SplashScreen from './components/SplashScreen';
import MiniPlayer from './components/player/MiniPlayer';
import GeneratingOverlay from './components/GeneratingOverlay';
import ToastContainer from './components/ui/Toast';

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
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashDone = useCallback(() => setSplashDone(true), []);

  if (!splashDone) return <SplashScreen onComplete={handleSplashDone} />;

  return (
    <>
      <RouterProvider router={router} />
      <MiniPlayer />
      <GeneratingOverlay />
      <ToastContainer />
    </>
  );
}
