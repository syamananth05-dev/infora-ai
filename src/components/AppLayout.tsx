import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useUIStore } from '../lib/stores';

export default function AppLayout() {
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { pathname } = useLocation();
  const showFloating = !sidebarOpen && !pathname.startsWith('/chat');
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto">
        {showFloating && (
          <button
            onClick={toggleSidebar}
            className="fixed left-3 top-3 z-50 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-surface-200 bg-white/90 text-surface-600 shadow-soft backdrop-blur transition-colors hover:text-accent-600 dark:border-surface-700 dark:bg-surface-900/90 dark:text-surface-300"
            aria-label="Open sidebar"
            title="Open sidebar"
          >
            ☰
          </button>
        )}
        <Outlet />
      </main>
    </div>
  );
}
