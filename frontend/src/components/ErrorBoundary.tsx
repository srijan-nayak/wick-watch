import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div style={styles.root}>
          <div style={styles.card}>
            <h2 style={styles.title}>Something went wrong</h2>
            <pre style={styles.message}>{this.state.error.message}</pre>
            <button
              style={styles.btn}
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
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
    border: '1px solid #ef4444',
    borderRadius: 12,
    padding: '32px 40px',
    maxWidth: 560,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: '#ef4444',
  },
  message: {
    margin: 0,
    fontSize: 12,
    color: '#9898b0',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    background: '#0f0f18',
    border: '1px solid #2a2a3a',
    borderRadius: 6,
    padding: '12px',
    maxHeight: 300,
    overflowY: 'auto',
  },
  btn: {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
};
