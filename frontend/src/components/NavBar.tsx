import { NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { logout } from '../api/client';
import { toast } from 'sonner';

const NAV_ITEMS = [
  { to: '/patterns', label: 'Patterns', icon: '⟨/⟩' },
  { to: '/tickers', label: 'Tickers', icon: '◈' },
  { to: '/backtest', label: 'Backtest', icon: '↺' },
  { to: '/live', label: 'Live', icon: '◉' },
] as const;

export default function NavBar() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const clearAuth = useStore((s) => s.clearAuth);
  const isLiveRunning = useStore((s) => s.isLiveRunning);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // best-effort
    }
    clearAuth();
    navigate('/login');
    toast.success('Logged out');
  };

  return (
    <nav style={styles.nav}>
      <div style={styles.logo}>
        <span style={styles.logoIcon}>◈</span>
        <span style={styles.logoText}>WickWatch</span>
      </div>

      <ul style={styles.navList}>
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {}),
              })}
            >
              <span style={styles.navIcon}>{icon}</span>
              <span>{label}</span>
              {label === 'Live' && isLiveRunning && (
                <span style={styles.liveDot} title="Live running" />
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div style={styles.userSection}>
        {user && (
          <div style={styles.userName} title={user.user_id}>
            {user.user_name ?? user.user_id}
          </div>
        )}
        <button style={styles.logoutBtn} onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </nav>
  );
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    width: 200,
    minWidth: 200,
    background: '#12121a',
    borderRight: '1px solid #2a2a3a',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 0',
    height: '100vh',
    position: 'sticky',
    top: 0,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 20px 28px',
    borderBottom: '1px solid #2a2a3a',
    marginBottom: 16,
  },
  logoIcon: {
    fontSize: 22,
    color: '#6366f1',
  },
  logoText: {
    fontSize: 17,
    fontWeight: 700,
    color: '#e8e8f0',
    letterSpacing: '0.02em',
  },
  navList: {
    listStyle: 'none',
    margin: 0,
    padding: '0 8px',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 8,
    color: '#9898b0',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
    transition: 'background 0.15s, color 0.15s',
    position: 'relative',
  },
  navLinkActive: {
    background: '#1e1e30',
    color: '#a5b4fc',
  },
  navIcon: {
    fontSize: 16,
    width: 20,
    textAlign: 'center',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#22c55e',
    marginLeft: 'auto',
    boxShadow: '0 0 6px #22c55e',
  },
  userSection: {
    padding: '16px 20px',
    borderTop: '1px solid #2a2a3a',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  userName: {
    fontSize: 12,
    color: '#6868a0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  logoutBtn: {
    background: 'transparent',
    border: '1px solid #2a2a3a',
    borderRadius: 6,
    color: '#9898b0',
    fontSize: 12,
    padding: '6px 12px',
    cursor: 'pointer',
    transition: 'border-color 0.15s, color 0.15s',
  },
};
