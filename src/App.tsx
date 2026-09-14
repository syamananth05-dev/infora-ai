import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSession } from './hooks/useSession';
import { useUIStore } from './lib/stores';
import Landing from './routes/Landing';
import Auth from './routes/Auth';
import AppLayout from './components/AppLayout';
import Dashboard from './routes/Dashboard';
import Chat from './routes/Chat';
import Projects from './routes/Projects';
import ProjectDetail from './routes/ProjectDetail';
import Settings from './routes/Settings';
import Admin from './routes/Admin';
import CommandPalette from './components/CommandPalette';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-50 dark:bg-surface-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

export default function App() {
  const { setPalette } = useUIStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPalette]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/:conversationId" element={<Chat />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:projectId" element={<ProjectDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <CommandPalette />
    </BrowserRouter>
  );
}
