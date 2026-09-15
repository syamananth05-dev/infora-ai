import { create } from 'zustand';

interface ThemeState {
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: (localStorage.getItem('infora-theme') as 'dark' | 'light') || 'dark',
  setTheme: (t) => {
    localStorage.setItem('infora-theme', t);
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
  sidebarOpen: typeof window !== 'undefined' && window.innerWidth >= 768,
  paletteOpen: false,
  setSidebar: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setPalette: (open) => set({ paletteOpen: open }),
}));
