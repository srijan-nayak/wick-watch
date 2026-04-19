// ─── Types ───────────────────────────────────────────────────────────────────

export interface Indicator {
  name: string;
  label: string;
  description: string;
  params: Record<string, { type: string; description: string; default: number | null }>;
}

export interface Pattern {
  id: number;
  name: string;
  dsl: string;
  interval: string;
  is_active: boolean;
}

export interface Ticker {
  id: number;
  symbol: string;
  instrument_token: number;
  is_active: boolean;
}

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  match: boolean;
}

export interface Alert {
  pattern: string;
  symbol: string;
  candle_time: string;
  triggered_at: string;
}

export interface AuthStatus {
  authenticated: boolean;
  user_id?: string;
  user_name?: string;
}

export interface LoginUrlResponse {
  url: string;
}

export interface LiveStatus {
  running: boolean;
}

export interface BacktestResult {
  candles: Candle[];
  matches: number;
}

export interface Instrument {
  instrument_token: number;
  symbol: string;
  name: string;
  exchange: string;
}

// ─── Client ──────────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:8000';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${options.method ?? 'GET'} ${path} failed (${res.status}): ${text}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const getLoginUrl = () =>
  request<LoginUrlResponse>('/api/auth/login-url');

export const getAuthStatus = () =>
  request<AuthStatus>('/api/auth/status');

export const logout = () =>
  request<void>('/api/auth/logout', { method: 'POST' });

// ─── Indicators ───────────────────────────────────────────────────────────────

export const getIndicators = () =>
  request<Indicator[]>('/api/indicators');

// ─── Patterns ─────────────────────────────────────────────────────────────────

export const getPatterns = () =>
  request<Pattern[]>('/api/patterns');

export const createPattern = (body: {
  name: string;
  dsl: string;
  interval: string;
  is_active: boolean;
}) => request<Pattern>('/api/patterns', { method: 'POST', body: JSON.stringify(body) });

export const updatePattern = (
  id: number,
  body: Partial<Omit<Pattern, 'id'>>,
) => request<Pattern>(`/api/patterns/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deletePattern = (id: number) =>
  request<void>(`/api/patterns/${id}`, { method: 'DELETE' });

// ─── Tickers ──────────────────────────────────────────────────────────────────

export const getTickers = () =>
  request<Ticker[]>('/api/tickers');

export const createTicker = (body: {
  symbol: string;
  instrument_token: number;
  is_active: boolean;
}) => request<Ticker>('/api/tickers', { method: 'POST', body: JSON.stringify(body) });

export const deleteTicker = (id: number) =>
  request<void>(`/api/tickers/${id}`, { method: 'DELETE' });

/**
 * Search instruments via backend.
 * NOTE: This endpoint may not be implemented yet on the backend.
 * If it returns 404, the Tickers page falls back to client-side filtering.
 */
export const searchInstruments = (exchange: string, query: string) =>
  request<Instrument[]>(`/api/instruments?exchange=${encodeURIComponent(exchange)}&query=${encodeURIComponent(query)}`);

// ─── Backtest ─────────────────────────────────────────────────────────────────

export const runBacktest = (body: {
  pattern_id: number;
  instrument_token: number;
  symbol: string;
  from_date: string;
  to_date: string;
  interval: string;
}) => request<BacktestResult>('/api/backtest', { method: 'POST', body: JSON.stringify(body) });

// ─── Live ─────────────────────────────────────────────────────────────────────

export const getLiveStatus = () =>
  request<LiveStatus>('/api/live/status');

export const startLive = () =>
  request<void>('/api/live/start', { method: 'POST' });

export const stopLive = () =>
  request<void>('/api/live/stop', { method: 'POST' });
