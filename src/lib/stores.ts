import { create } from 'zustand';

interface ThemeState {
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: (localStorage.getItem('synapse-theme') as 'dark' | 'light') || 'dark',
  setTheme: (t) => {
    localStorage.setItem('synapse-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
    set({ theme: t });
  },
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}));

interface UIState {
  sidebarOpen: boolean;
  paletteOpen: boolean;
  setSidebar: (open: boolean) => void;
  toggleSidebar: () => void;
  setPalette: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  paletteOpen: false,
  setSidebar: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setPalette: (open) => set({ paletteOpen: open }),
}));
