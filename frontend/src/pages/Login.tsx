import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLoginUrl, getAuthStatus } from '../api/client';
import { useStore } from '../store';
import { toast } from 'sonner';

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useStore((s) => s.setAuth);
  const theme = useStore((s) => s.theme);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Apply theme on public pages too
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const stopPolling = () => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => () => stopPolling(), []);

  const startPolling = () => {
    setPolling(true);
    pollRef.current = setInterval(async () => {
      try {
        const status = await getAuthStatus();
        if (status.authenticated && status.user_id) {
          stopPolling();
          setPolling(false);
          setAuth({ user_id: status.user_id, user_name: status.user_name ?? status.user_id });
          navigate('/patterns', { replace: true });
        }
      } catch {
        // swallow — backend may not be ready
      }
    }, 2000);
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const { url } = await getLoginUrl();
      window.open(url, '_blank');
      startPolling();
      toast.info('Complete login in your browser, then return here.');
    } catch (err) {
      toast.error('Failed to get login URL. Is the backend running?');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <div style={styles.logoRow}>
          <span style={styles.logoIcon}>◈</span>
          <h1 style={styles.title}>WickWatch</h1>
        </div>
        <p style={styles.subtitle}>Trading pattern detection for Kite</p>

        <button
          style={{ ...styles.loginBtn, ...(loading ? styles.loginBtnDisabled : {}) }}
          onClick={handleLogin}
          disabled={loading || polling}
        >
          {loading ? 'Opening browser…' : polling ? 'Waiting for login…' : 'Login with Kite'}
        </button>

        {polling && (
          <div style={styles.pollingHint}>
            <div style={styles.spinner} />
            <p style={styles.hintText}>
              Complete login in your browser. Return here after.
            </p>
          </div>
        )}

        {!polling && (
          <p style={styles.hint}>
            A browser window will open for Kite authentication.
          </p>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: 'var(--bg-base)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '48px 40px',
    width: 360,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    boxShadow: '0 24px 60px rgba(0,0,0,0.15)',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  logoIcon: {
    fontSize: 36,
    color: 'var(--accent)',
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    color: 'var(--text-primary)',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: 0,
    color: 'var(--text-ghost)',
    fontSize: 14,
  },
  loginBtn: {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '13px 32px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    transition: 'background 0.15s',
    letterSpacing: '0.01em',
  },
  loginBtnDisabled: {
    background: 'var(--accent-dark)',
    cursor: 'not-allowed',
    opacity: 0.7,
  },
  pollingHint: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  spinner: {
    width: 24,
    height: 24,
    border: '3px solid var(--border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  hintText: {
    margin: 0,
    color: 'var(--text-dim)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 1.5,
  },
  hint: {
    margin: 0,
    color: 'var(--text-disabled)',
    fontSize: 12,
    textAlign: 'center',
  },
};
