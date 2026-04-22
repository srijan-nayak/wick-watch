import { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from 'react-router-dom';
import { Toaster } from 'sonner';
import { getAuthStatus } from './api/client';
import { useStore } from './store';
import { useWebSocket } from './hooks/useWebSocket';
import NavBar from './components/NavBar';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Callback from './pages/Callback';
import Patterns from './pages/Patterns';
import Tickers from './pages/Tickers';
import Backtest from './pages/Backtest';
import Live from './pages/Live';
import Docs from './pages/Docs';

// ─── Auth guard ───────────────────────────────────────────────────────────────

function RequireAuth() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

// ─── Authenticated shell (nav + page) ─────────────────────────────────────────

function AppShell() {
  useWebSocket();
  const theme = useStore((s) => s.theme);

  // Sync data-theme attribute on <html> whenever the theme changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div style={shellStyles.root}>
      <NavBar />
      <main style={shellStyles.main}>
        <Outlet />
      </main>
      {/* Toaster here so it can react to theme */}
      <Toaster
        position="bottom-right"
        theme={theme}
        toastOptions={{
          style: {
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontSize: '13px',
          },
        }}
      />
    </div>
  );
}

const shellStyles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    minHeight: '100vh',
    background: 'var(--bg-base)',
  },
  main: {
    flex: 1,
    overflowY: 'auto',
  },
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────

function Bootstrap({ children }: { children: React.ReactNode }) {
  const setAuth = useStore((s) => s.setAuth);
  const theme = useStore((s) => s.theme);
  const [ready, setReady] = useState(false);

  // Apply theme immediately on mount (before auth check completes)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    getAuthStatus()
      .then((status) => {
        if (status.authenticated && status.user_id) {
          setAuth({
            user_id: status.user_id,
            user_name: status.user_name ?? status.user_id,
          });
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [setAuth]);

  if (!ready) {
    return (
      <div style={bootstrapStyles.splash}>
        <div style={bootstrapStyles.spinner} />
      </div>
    );
  }

  return <>{children}</>;
}

const bootstrapStyles: Record<string, React.CSSProperties> = {
  splash: {
    minHeight: '100vh',
    background: 'var(--bg-base)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid var(--border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Bootstrap>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/callback" element={<Callback />} />

            {/* Protected routes */}
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/patterns" element={<ErrorBoundary><Patterns /></ErrorBoundary>} />
                <Route path="/tickers" element={<ErrorBoundary><Tickers /></ErrorBoundary>} />
                <Route path="/backtest" element={<ErrorBoundary><Backtest /></ErrorBoundary>} />
                <Route path="/live" element={<ErrorBoundary><Live /></ErrorBoundary>} />
                <Route path="/docs" element={<ErrorBoundary><Docs /></ErrorBoundary>} />
              </Route>
            </Route>

            {/* Default redirect */}
            <Route path="*" element={<Navigate to="/patterns" replace />} />
          </Routes>
        </Bootstrap>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
