import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getAuthStatus } from '../api/client';
import { useStore } from '../store';
import { toast } from 'sonner';

export default function Callback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useStore((s) => s.setAuth);
  const [message, setMessage] = useState('Verifying login…');

  useEffect(() => {
    const status = searchParams.get('status');

    const verify = async () => {
      if (status === 'success') {
        try {
          const authStatus = await getAuthStatus();
          if (authStatus.authenticated && authStatus.user_id) {
            setAuth({
              user_id: authStatus.user_id,
              user_name: authStatus.user_name ?? authStatus.user_id,
            });
            setMessage('Login successful! Returning to app…');
            // This tab was opened by window.open() — close it so the
            // original tab's polling detects auth and navigates there.
            window.close();
            // Fallback: if the browser blocks window.close() navigate here instead.
            setTimeout(() => navigate('/patterns', { replace: true }), 500);
          } else {
            setMessage('Authentication not confirmed. Please try again.');
            setTimeout(() => navigate('/login', { replace: true }), 2500);
          }
        } catch {
          setMessage('Error verifying login. Redirecting…');
          toast.error('Could not verify authentication.');
          setTimeout(() => navigate('/login', { replace: true }), 2000);
        }
      } else {
        setMessage('Login was not successful. Redirecting…');
        setTimeout(() => navigate('/login', { replace: true }), 2000);
      }
    };

    verify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <div style={styles.spinner} />
        <p style={styles.message}>{message}</p>
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
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    minWidth: 280,
  },
  spinner: {
    width: 40,
    height: 40,
    border: '4px solid var(--border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  message: {
    margin: 0,
    color: 'var(--text-dim)',
    fontSize: 14,
    textAlign: 'center',
  },
};
