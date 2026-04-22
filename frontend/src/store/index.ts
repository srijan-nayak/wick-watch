import { create } from 'zustand';
import type { Pattern, Ticker, Alert } from '../api/client';

export type Theme = 'dark' | 'light';

interface User {
  user_id: string;
  user_name: string;
}

interface WickWatchState {
  // Auth
  isAuthenticated: boolean;
  user: User | null;

  // Data
  patterns: Pattern[];
  tickers: Ticker[];

  // Live
  isLiveRunning: boolean;

  // Alerts – last 50, newest first
  alerts: Alert[];

  // Theme
  theme: Theme;
}

interface WickWatchActions {
  setAuth: (user: User) => void;
  clearAuth: () => void;
  setPatterns: (patterns: Pattern[]) => void;
  setTickers: (tickers: Ticker[]) => void;
  setLiveRunning: (running: boolean) => void;
  addAlert: (alert: Alert) => void;
  clearAlerts: () => void;
  toggleTheme: () => void;
}

export type WickWatchStore = WickWatchState & WickWatchActions;

function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem('ww-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* ignore */ }
  return 'dark';
}

export const useStore = create<WickWatchStore>((set) => ({
  // Initial state
  isAuthenticated: false,
  user: null,
  patterns: [],
  tickers: [],
  isLiveRunning: false,
  alerts: [],
  theme: loadTheme(),

  // Actions
  setAuth: (user) => set({ isAuthenticated: true, user }),

  clearAuth: () => set({ isAuthenticated: false, user: null }),

  setPatterns: (patterns) => set({ patterns }),

  setTickers: (tickers) => set({ tickers }),

  setLiveRunning: (running) => set({ isLiveRunning: running }),

  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, 50),
    })),

  clearAlerts: () => set({ alerts: [] }),

  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('ww-theme', next); } catch { /* ignore */ }
      return { theme: next };
    }),
}));
