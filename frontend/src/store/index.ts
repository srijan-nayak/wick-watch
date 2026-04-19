import { create } from 'zustand';
import type { Pattern, Ticker, Alert } from '../api/client';

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
}

interface WickWatchActions {
  setAuth: (user: User) => void;
  clearAuth: () => void;
  setPatterns: (patterns: Pattern[]) => void;
  setTickers: (tickers: Ticker[]) => void;
  setLiveRunning: (running: boolean) => void;
  addAlert: (alert: Alert) => void;
  clearAlerts: () => void;
}

export type WickWatchStore = WickWatchState & WickWatchActions;

export const useStore = create<WickWatchStore>((set) => ({
  // Initial state
  isAuthenticated: false,
  user: null,
  patterns: [],
  tickers: [],
  isLiveRunning: false,
  alerts: [],

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
}));
