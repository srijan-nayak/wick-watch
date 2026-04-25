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
  exchange: string;
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
  matches: string[];
}

export interface Instrument {
  instrument_token: number;
  symbol: string;
  name: string;
  exchange: string;
}

// ─── Client ──────────────────────────────────────────────────────────────────

// In Tauri the webview origin is tauri://localhost, so API calls must be
// absolute. In a plain browser (Docker / web) the frontend is served by the
// same FastAPI server, so relative URLs work and avoid CORS entirely.
const BASE_URL =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? 'http://localhost:8000'
    : '';

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

// ─── DSL ──────────────────────────────────────────────────────────────────────

export interface DslError {
  line: number;
  col: number;
  message: string;
}

export interface DslValidateResult {
  ok: boolean;
  errors: DslError[];
}

export const validateDsl = (dsl: string) =>
  request<DslValidateResult>('/api/dsl/validate', {
    method: 'POST',
    body: JSON.stringify({ dsl }),
  });

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
  exchange: string;
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
  ticker_id: number;
  from_date: string;
  to_date: string;
}) => request<BacktestResult>('/api/backtest', { method: 'POST', body: JSON.stringify(body) });

// ─── Live ─────────────────────────────────────────────────────────────────────

export const getLiveStatus = () =>
  request<LiveStatus>('/api/live/status');

export const startLive = () =>
  request<void>('/api/live/start', { method: 'POST' });

export const stopLive = () =>
  request<void>('/api/live/stop', { method: 'POST' });

// ─── Data export / import ─────────────────────────────────────────────────────

export interface ImportResult {
  patterns_added:   number;
  patterns_skipped: number;
  tickers_added:    number;
  tickers_skipped:  number;
  history_added:    number;
  history_skipped:  number;
}

export const exportData = () =>
  request<unknown>('/api/data/export');

export const importData = (payload: unknown) =>
  request<ImportResult>('/api/data/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

// ─── History ──────────────────────────────────────────────────────────────────

export interface PatternMatchRecord {
  id: number;
  pattern_id: number | null;
  pattern_name: string;
  interval: string;
  ticker_symbol: string;
  exchange: string;
  candle_time: string;
  detected_at: string;
}

export interface HistoryPage {
  items: PatternMatchRecord[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export const getHistory = (params: {
  page?: number;
  page_size?: number;
  pattern_id?: number | null;
  ticker_symbol?: string;
}) => {
  const q = new URLSearchParams();
  if (params.page)          q.set('page',          String(params.page));
  if (params.page_size)     q.set('page_size',     String(params.page_size));
  if (params.pattern_id)    q.set('pattern_id',    String(params.pattern_id));
  if (params.ticker_symbol) q.set('ticker_symbol', params.ticker_symbol);
  return request<HistoryPage>(`/api/history?${q}`);
};

export const clearHistory = () =>
  request<{ deleted: number }>('/api/history', { method: 'DELETE' });
