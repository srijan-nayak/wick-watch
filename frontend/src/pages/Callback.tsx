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
            toast.success(`Welcome, ${authStatus.user_name ?? authStatus.user_id}!`);
            navigate('/patterns', { replace: true });
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
    background: '#0f0f13',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    background: '#1a1a24',
    border: '1px solid #2a2a3a',
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
    border: '4px solid #2a2a3a',
    borderTopColor: '#6366f1',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  message: {
    margin: 0,
    color: '#9898b0',
    fontSize: 14,
    textAlign: 'center',
  },
};
