import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { exportData, importData } from '../api/client';
import type { ImportResult } from '../api/client';

export default function Settings() {
  const fileInputRef            = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportData();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href     = url;
      a.download = `wickwatch-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  // ── Import ──────────────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-selected after a failure
    e.target.value = '';

    setImporting(true);
    try {
      const text    = await file.text();
      const payload = JSON.parse(text);
      const result: ImportResult = await importData(payload);

      const parts: string[] = [];
      if (result.patterns_added > 0)
        parts.push(`${result.patterns_added} pattern${result.patterns_added !== 1 ? 's' : ''} added`);
      if (result.tickers_added > 0)
        parts.push(`${result.tickers_added} ticker${result.tickers_added !== 1 ? 's' : ''} added`);
      if (result.history_added > 0)
        parts.push(`${result.history_added} history record${result.history_added !== 1 ? 's' : ''} added`);
      if (result.patterns_skipped > 0)
        parts.push(`${result.patterns_skipped} pattern${result.patterns_skipped !== 1 ? 's' : ''} skipped (already exist)`);
      if (result.tickers_skipped > 0)
        parts.push(`${result.tickers_skipped} ticker${result.tickers_skipped !== 1 ? 's' : ''} skipped (already exist)`);
      if (result.history_skipped > 0)
        parts.push(`${result.history_skipped} history record${result.history_skipped !== 1 ? 's' : ''} skipped (already exist)`);

      if (parts.length === 0) {
        toast.info('Nothing new to import — everything already exists');
      } else {
        toast.success(parts.join(', '));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed — check the file format');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <h1 style={styles.pageTitle}>Settings</h1>
        <p style={styles.pageSubtitle}>Manage your WickWatch data.</p>
      </div>

      {/* Data backup card */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Data Backup</h2>
        <p style={styles.cardDesc}>
          Export all your patterns, tickers, and match history to a JSON file. You can re-import
          it any time to restore your setup — duplicates are automatically skipped.
        </p>

        <div style={styles.actions}>
          {/* Export */}
          <div style={styles.actionBlock}>
            <div style={styles.actionLabel}>Export</div>
            <p style={styles.actionDesc}>
              Download a backup of all patterns, tickers, and match history.
            </p>
            <button
              style={{ ...styles.btn, ...styles.btnPrimary, ...(exporting ? styles.btnDisabled : {}) }}
              onClick={handleExport}
              disabled={exporting}
            >
              <span style={styles.btnIcon}>↓</span>
              {exporting ? 'Exporting…' : 'Download backup'}
            </button>
          </div>

          <div style={styles.divider} />

          {/* Import */}
          <div style={styles.actionBlock}>
            <div style={styles.actionLabel}>Import</div>
            <p style={styles.actionDesc}>
              Restore from a previously exported backup file. Existing patterns, tickers,
              and history records that already exist are left untouched.
            </p>
            <button
              style={{ ...styles.btn, ...styles.btnSecondary, ...(importing ? styles.btnDisabled : {}) }}
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              <span style={styles.btnIcon}>↑</span>
              {importing ? 'Importing…' : 'Choose backup file'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    padding: '28px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    maxWidth: 680,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  pageTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  pageSubtitle: {
    margin: 0,
    fontSize: 13,
    color: 'var(--text-disabled)',
  },
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  cardTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  cardDesc: {
    margin: 0,
    fontSize: 13,
    color: 'var(--text-dim)',
    lineHeight: 1.6,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    border: '1px solid var(--border)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  actionBlock: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text-faint)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  actionDesc: {
    margin: 0,
    fontSize: 12,
    color: 'var(--text-disabled)',
    lineHeight: 1.6,
  },
  divider: {
    height: 1,
    background: 'var(--border)',
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    border: 'none',
    borderRadius: 7,
    padding: '10px 18px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  btnPrimary: {
    background: 'var(--accent)',
    color: '#fff',
  },
  btnSecondary: {
    background: 'var(--bg-input)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
  },
  btnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  btnIcon: {
    fontSize: 15,
    lineHeight: 1,
  },
};
