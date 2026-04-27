import { useEffect, useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getLiveStatus, startLive, stopLive } from '../api/client';
import { useStore } from '../store';
import type { Alert } from '../api/client';
import type { LogEntry } from '../store';
import {
  requestNotificationPermission,
  notificationPermission,
  playAlertChime,
} from '../lib/alertNotify';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function parseUTC(iso: string): Date {
  const hasTimezone = iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso);
  return new Date(hasTimezone ? iso : iso + 'Z');
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function fmtCandleTime(iso: string): string {
  return parseUTC(iso).toLocaleString(undefined, {
    timeZone: 'Asia/Kolkata',
    month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

const PATTERN_COLORS = [
  '#818cf8', '#34d399', '#f472b6', '#fb923c',
  '#60a5fa', '#a78bfa', '#4ade80', '#facc15',
];

function patternColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PATTERN_COLORS[hash % PATTERN_COLORS.length];
}

// ─── Alert row ────────────────────────────────────────────────────────────────

function AlertRow({ alert }: { alert: Alert }) {
  const color = patternColor(alert.pattern);
  return (
    <div style={styles.alertItem}>
      <div style={{ ...styles.alertAccent, background: color }} />
      <div style={styles.alertBody}>
        <div style={styles.alertTop}>
          <span style={{ ...styles.alertPattern, color }}>{alert.pattern}</span>
          <span style={styles.alertTime}>{timeAgo(alert.triggered_at)}</span>
        </div>
        <div style={styles.alertMeta}>
          <span style={styles.alertSymbol}>{alert.symbol}</span>
          <span style={styles.alertSep}>·</span>
          <span style={styles.alertCandleTime}>{fmtCandleTime(alert.candle_time)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Log row ──────────────────────────────────────────────────────────────────

const LOG_COLORS: Record<LogEntry['level'], string> = {
  info:  'var(--text-dim)',
  warn:  '#fb923c',
  error: 'var(--danger)',
};

const LOG_PREFIX: Record<LogEntry['level'], string> = {
  info:  'INFO',
  warn:  'WARN',
  error: 'ERR ',
};

function LogRow({ entry }: { entry: LogEntry }) {
  return (
    <div style={styles.logRow}>
      <span style={styles.logTime}>{fmtTime(entry.ts)}</span>
      <span style={{ ...styles.logLevel, color: LOG_COLORS[entry.level] }}>
        {LOG_PREFIX[entry.level]}
      </span>
      <span style={{ ...styles.logMsg, color: LOG_COLORS[entry.level] }}>
        {entry.message}
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'alerts' | 'logs';

export default function Live() {
  const isLiveRunning = useStore((s) => s.isLiveRunning);
  const setLiveRunning = useStore((s) => s.setLiveRunning);
  const alerts         = useStore((s) => s.alerts);
  const clearAlerts    = useStore((s) => s.clearAlerts);
  const logs           = useStore((s) => s.logs);
  const clearLogs      = useStore((s) => s.clearLogs);

  const [tab, setTab]   = useState<Tab>('alerts');
  const [notifPerm, setNotifPerm] = useState<ReturnType<typeof notificationPermission>>(
    () => notificationPermission(),
  );

  // Auto-scroll the log pane to the bottom when new entries arrive
  // (logs are newest-first in the store, but we reverse for display so the
  //  newest line is at the bottom — classic terminal convention)
  const logEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tab === 'logs') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, tab]);

  // Switch to the Logs tab automatically when seeding starts so the user
  // can see progress without having to click manually
  const prevLogCount = useRef(0);
  useEffect(() => {
    if (logs.length > prevLogCount.current && prevLogCount.current === 0) {
      setTab('logs');
    }
    prevLogCount.current = logs.length;
  }, [logs.length]);

  const fetchStatus = useCallback(async () => {
    try {
      const status = await getLiveStatus();
      setLiveRunning(status.running);
    } catch { /* swallow */ }
  }, [setLiveRunning]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleStart = async () => {
    if (notifPerm === 'default') {
      const granted = await requestNotificationPermission();
      setNotifPerm(granted ? 'granted' : 'denied');
    }
    playAlertChime();
    clearLogs();

    try {
      await startLive();
      setLiveRunning(true);
      toast.success('Live detection started');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start live detection');
    }
  };

  const handleStop = async () => {
    try {
      await stopLive();
      setLiveRunning(false);
      toast.info('Live detection stopped');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to stop live detection');
    }
  };

  const notifBorderColor =
    notifPerm === 'granted' ? 'var(--success-border)' :
    notifPerm === 'denied'  ? 'var(--danger-border)'  : 'var(--border)';
  const notifTextColor =
    notifPerm === 'granted' ? 'var(--success)' :
    notifPerm === 'denied'  ? 'var(--danger)'  : 'var(--text-dim)';
  const notifLabel =
    notifPerm === 'granted' ? '🔔 Notifications on' :
    notifPerm === 'denied'  ? '🔕 Notifications blocked' : '🔔 Notifications';

  // Logs displayed oldest→newest (reverse of store order) for terminal feel
  const logsAsc = [...logs].reverse();
  const unreadLogs = logs.length;

  return (
    <div style={styles.root}>
      {/* ── Header ── */}
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <h1 style={styles.pageTitle}>Live Detection</h1>

          <div style={styles.statusBadge}>
            <div
              style={{
                ...styles.statusDot,
                background: isLiveRunning ? 'var(--success)' : 'var(--text-placeholder)',
                boxShadow: isLiveRunning ? '0 0 8px var(--success)' : 'none',
              }}
            />
            <span style={{
              ...styles.statusLabel,
              color: isLiveRunning ? 'var(--success)' : 'var(--text-ghost)',
            }}>
              {isLiveRunning ? 'Running' : 'Stopped'}
            </span>
          </div>

          {notifPerm !== 'unsupported' && (
            <div
              style={{ ...styles.notifBadge, borderColor: notifBorderColor, color: notifTextColor }}
              title={
                notifPerm === 'granted' ? 'Browser notifications enabled' :
                notifPerm === 'denied'  ? 'Notifications blocked — allow them in browser settings' :
                'Notifications will be requested when you start detection'
              }
            >
              {notifLabel}
            </div>
          )}
        </div>

        <div style={styles.controls}>
          {isLiveRunning ? (
            <button style={styles.stopBtn} onClick={handleStop}>■ Stop</button>
          ) : (
            <button style={styles.startBtn} onClick={handleStart}>▶ Start</button>
          )}
        </div>
      </div>

      {/* ── Tabbed panel ── */}
      <div style={styles.panel}>

        {/* Tab bar */}
        <div style={styles.tabBar}>
          <button
            style={{ ...styles.tab, ...(tab === 'alerts' ? styles.tabActive : {}) }}
            onClick={() => setTab('alerts')}
          >
            Alerts
            {alerts.length > 0 && (
              <span style={styles.tabBadge}>{alerts.length}</span>
            )}
          </button>
          <button
            style={{ ...styles.tab, ...(tab === 'logs' ? styles.tabActive : {}) }}
            onClick={() => setTab('logs')}
          >
            Logs
            {unreadLogs > 0 && (
              <span style={{
                ...styles.tabBadge,
                ...(tab !== 'logs' ? styles.tabBadgeUnread : {}),
              }}>
                {unreadLogs}
              </span>
            )}
          </button>

          {/* Clear button lives in the tab bar, context-sensitive */}
          <div style={styles.tabBarSpacer} />
          {tab === 'alerts' && alerts.length > 0 && (
            <button style={styles.clearBtn} onClick={clearAlerts}>Clear all</button>
          )}
          {tab === 'logs' && logs.length > 0 && (
            <button style={styles.clearBtn} onClick={clearLogs}>Clear</button>
          )}
        </div>

        {/* ── Alerts tab ── */}
        {tab === 'alerts' && (
          alerts.length === 0 ? (
            <div style={styles.emptyPane}>
              <span style={styles.emptyIcon}>◉</span>
              <p style={styles.emptyText}>
                {isLiveRunning ? 'Watching for pattern matches…' : 'Start live detection to see alerts here.'}
              </p>
            </div>
          ) : (
            <div style={styles.alertList}>
              {alerts.map((alert, i) => (
                <AlertRow key={`${alert.pattern}-${alert.triggered_at}-${i}`} alert={alert} />
              ))}
            </div>
          )
        )}

        {/* ── Logs tab ── */}
        {tab === 'logs' && (
          logs.length === 0 ? (
            <div style={styles.emptyPane}>
              <span style={styles.emptyIcon}>⬡</span>
              <p style={styles.emptyText}>No logs yet — start live detection to see activity here.</p>
            </div>
          ) : (
            <div style={styles.logPane}>
              {logsAsc.map((entry, i) => (
                <LogRow key={i} entry={entry} />
              ))}
              <div ref={logEndRef} />
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    padding: '28px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: 28,
    maxWidth: 800,
  },

  // Header
  header: { display: 'flex', flexDirection: 'column', gap: 16 },
  titleRow: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  pageTitle: { margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' },
  statusBadge: {
    display: 'flex', alignItems: 'center', gap: 7,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 20, padding: '5px 14px',
  },
  statusDot: {
    width: 8, height: 8, borderRadius: '50%',
    transition: 'background 0.3s, box-shadow 0.3s',
  },
  statusLabel: { fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' },
  notifBadge: {
    fontSize: 11, fontWeight: 600, border: '1px solid',
    borderRadius: 20, padding: '4px 12px', cursor: 'default', letterSpacing: '0.02em',
  },
  controls: { display: 'flex', gap: 12 },
  startBtn: {
    background: 'var(--success-bg)', border: '1px solid var(--success-border)',
    color: 'var(--success)', borderRadius: 8, padding: '11px 24px',
    fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em',
  },
  stopBtn: {
    background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
    color: 'var(--danger)', borderRadius: 8, padding: '11px 24px',
    fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em',
  },

  // Tabbed panel
  panel: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column',
  },
  tabBar: {
    display: 'flex', alignItems: 'center', gap: 0,
    borderBottom: '1px solid var(--border)', padding: '0 4px',
    background: 'var(--bg-input)',
  },
  tab: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '12px 16px', fontSize: 13, fontWeight: 600,
    color: 'var(--text-faint)', background: 'transparent',
    border: 'none', borderBottom: '2px solid transparent',
    cursor: 'pointer', transition: 'color 0.15s, border-color 0.15s',
    marginBottom: -1,
  },
  tabActive: {
    color: 'var(--accent-light)',
    borderBottomColor: 'var(--accent)',
  },
  tabBadge: {
    background: 'var(--badge-bg)', borderRadius: 10,
    padding: '1px 7px', fontSize: 10, color: 'var(--badge-color)', fontWeight: 700,
  },
  tabBadgeUnread: {
    background: 'var(--accent)', color: '#fff',
  },
  tabBarSpacer: { flex: 1 },
  clearBtn: {
    background: 'transparent', border: '1px solid var(--remove-border)',
    color: 'var(--remove-color)', borderRadius: 6,
    padding: '4px 12px', fontSize: 11, cursor: 'pointer', marginRight: 8,
  },

  // Shared empty state
  emptyPane: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 12, padding: '48px 20px',
  },
  emptyIcon: { fontSize: 28, color: 'var(--border)' },
  emptyText: { margin: 0, color: 'var(--text-placeholder)', fontSize: 13, textAlign: 'center' },

  // Alerts
  alertList: { overflowY: 'auto', maxHeight: 520, display: 'flex', flexDirection: 'column' },
  alertItem: { display: 'flex', borderBottom: '1px solid var(--border-subtle)' },
  alertAccent: { width: 4, flexShrink: 0 },
  alertBody: { flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 },
  alertTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  alertPattern: { fontSize: 13, fontWeight: 700 },
  alertTime: { fontSize: 11, color: 'var(--text-disabled)' },
  alertMeta: { display: 'flex', alignItems: 'center', gap: 6 },
  alertSymbol: { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' },
  alertSep: { color: 'var(--border-mid)' },
  alertCandleTime: { fontSize: 11, color: 'var(--text-disabled)' },

  // Logs
  logPane: {
    overflowY: 'auto', maxHeight: 520,
    padding: '8px 0',
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
    display: 'flex', flexDirection: 'column',
  },
  logRow: {
    display: 'flex', alignItems: 'baseline', gap: 10,
    padding: '3px 16px',
    fontSize: 12, lineHeight: 1.6,
  },
  logTime: {
    color: 'var(--text-placeholder)', flexShrink: 0, fontSize: 11,
  },
  logLevel: {
    flexShrink: 0, fontWeight: 700, fontSize: 10,
    letterSpacing: '0.05em', width: 32,
  },
  logMsg: {
    flex: 1, wordBreak: 'break-word',
  },
};
