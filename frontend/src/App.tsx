import { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from 'react-router-dom';
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

// ─── Auth guard ───────────────────────────────────────────────────────────────

function RequireAuth() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

// ─── Authenticated shell (nav + page) ─────────────────────────────────────────

function AppShell() {
  useWebSocket();
  return (
    <div style={shellStyles.root}>
      <NavBar />
      <main style={shellStyles.main}>
        <Outlet />
      </main>
    </div>
  );
}

const shellStyles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    minHeight: '100vh',
    background: '#0f0f13',
  },
  main: {
    flex: 1,
    overflowY: 'auto',
  },
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────

function Bootstrap({ children }: { children: React.ReactNode }) {
  const setAuth = useStore((s) => s.setAuth);
  const [ready, setReady] = useState(false);

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
      .catch(() => {
        // Backend unreachable — proceed unauthenticated
      })
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
    background: '#0f0f13',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #2a2a3a',
    borderTopColor: '#6366f1',
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
