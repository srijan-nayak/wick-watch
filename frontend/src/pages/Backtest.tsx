import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { getPatterns, runBacktest } from '../api/client';
import type { Candle, Pattern } from '../api/client';
import { useStore } from '../store';
import CandleChart from '../components/CandleChart';

const today = () => new Date().toISOString().split('T')[0];
const thirtyDaysAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
};

interface BacktestForm {
  pattern_id: string;
  instrument_token: string;
  symbol: string;
  from_date: string;
  to_date: string;
  interval: string;
}

const INTERVALS = [
  { value: 'minute', label: '1 min' },
  { value: '3minute', label: '3 min' },
  { value: '5minute', label: '5 min' },
  { value: '10minute', label: '10 min' },
  { value: '15minute', label: '15 min' },
  { value: '30minute', label: '30 min' },
  { value: '60minute', label: '60 min' },
];

export default function Backtest() {
  const storePatterns = useStore((s) => s.patterns);
  const setPatterns = useStore((s) => s.setPatterns);

  const [patterns, setLocalPatterns] = useState<Pattern[]>(storePatterns);
  const [form, setForm] = useState<BacktestForm>({
    pattern_id: '',
    instrument_token: '',
    symbol: '',
    from_date: thirtyDaysAgo(),
    to_date: today(),
    interval: 'day',
  });

  const [running, setRunning] = useState(false);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [matchCount, setMatchCount] = useState<number | null>(null);

  const loadPatterns = useCallback(async () => {
    try {
      const data = await getPatterns();
      setLocalPatterns(data);
      setPatterns(data);
    } catch {
      // already have store patterns
    }
  }, [setPatterns]);

  useEffect(() => {
    if (storePatterns.length === 0) loadPatterns();
    else setLocalPatterns(storePatterns);
  }, [storePatterns, loadPatterns]);

  // Sync interval from selected pattern
  useEffect(() => {
    if (form.pattern_id) {
      const p = patterns.find((pat) => pat.id === Number(form.pattern_id));
      if (p) setForm((f) => ({ ...f, interval: p.interval }));
    }
  }, [form.pattern_id, patterns]);

  const setField = <K extends keyof BacktestForm>(k: K, v: BacktestForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleRun = async () => {
    if (!form.pattern_id) return toast.error('Select a pattern');
    if (!form.instrument_token || !form.symbol)
      return toast.error('Enter instrument token and symbol');

    const token = Number(form.instrument_token);
    if (isNaN(token)) return toast.error('Instrument token must be a number');

    setRunning(true);
    setCandles([]);
    setMatchCount(null);

    try {
      const result = await runBacktest({
        pattern_id: Number(form.pattern_id),
        instrument_token: token,
        symbol: form.symbol.toUpperCase(),
        from_date: form.from_date,
        to_date: form.to_date,
        interval: form.interval,
      });
      setCandles(result.candles);
      setMatchCount(result.matches);
      if (result.matches === 0) {
        toast.info('Backtest complete — no matches found');
      } else {
        toast.success(`Found ${result.matches} match${result.matches !== 1 ? 'es' : ''}!`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backtest failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <h1 style={styles.pageTitle}>Backtest</h1>
        <p style={styles.pageSubtitle}>
          Run a pattern against historical candles and visualize matches.
        </p>
      </div>

      <div style={styles.formCard}>
        <div style={styles.formGrid}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Pattern</label>
            <select
              style={styles.select}
              value={form.pattern_id}
              onChange={(e) => setField('pattern_id', e.target.value)}
            >
              <option value="">— select pattern —</option>
              {patterns.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Interval</label>
            <select
              style={styles.select}
              value={form.interval}
              onChange={(e) => setField('interval', e.target.value)}
            >
              {INTERVALS.map((iv) => (
                <option key={iv.value} value={iv.value}>
                  {iv.label}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Symbol</label>
            <input
              style={styles.input}
              value={form.symbol}
              onChange={(e) => setField('symbol', e.target.value)}
              placeholder="e.g. RELIANCE"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Instrument Token</label>
            <input
              style={styles.input}
              value={form.instrument_token}
              onChange={(e) => setField('instrument_token', e.target.value)}
              placeholder="e.g. 738561"
              type="number"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>From Date</label>
            <input
              style={styles.input}
              type="date"
              value={form.from_date}
              onChange={(e) => setField('from_date', e.target.value)}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>To Date</label>
            <input
              style={styles.input}
              type="date"
              value={form.to_date}
              onChange={(e) => setField('to_date', e.target.value)}
            />
          </div>
        </div>

        <button
          style={{ ...styles.runBtn, ...(running ? styles.runBtnDisabled : {}) }}
          onClick={handleRun}
          disabled={running}
        >
          {running ? (
            <>
              <span style={styles.btnSpinner} />
              Running…
            </>
          ) : (
            'Run Backtest'
          )}
        </button>
      </div>

      {matchCount !== null && (
        <div style={styles.summaryCard}>
          <span style={styles.summaryIcon}>◈</span>
          <span style={styles.summaryText}>
            <strong style={{ color: matchCount > 0 ? '#22c55e' : '#9898b0' }}>
              {matchCount} match{matchCount !== 1 ? 'es' : ''}
            </strong>{' '}
            found over{' '}
            <strong style={{ color: '#a5b4fc' }}>{candles.length} candles</strong>
          </span>
        </div>
      )}

      {candles.length > 0 && (
        <div style={styles.chartSection}>
          <h3 style={styles.chartTitle}>Candlestick Chart</h3>
          <CandleChart candles={candles} />
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    padding: '28px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    maxWidth: 960,
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
    color: '#e8e8f0',
  },
  pageSubtitle: {
    margin: 0,
    fontSize: 13,
    color: '#5a5a7a',
  },
  formCard: {
    background: '#1a1a24',
    border: '1px solid #2a2a3a',
    borderRadius: 12,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px 24px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    color: '#7878a8',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  input: {
    background: '#111118',
    border: '1px solid #2a2a3a',
    borderRadius: 8,
    color: '#e8e8f0',
    fontSize: 13,
    padding: '10px 14px',
    outline: 'none',
  },
  select: {
    background: '#111118',
    border: '1px solid #2a2a3a',
    borderRadius: 8,
    color: '#e8e8f0',
    fontSize: 13,
    padding: '10px 14px',
    outline: 'none',
    cursor: 'pointer',
  },
  runBtn: {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '12px 28px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    alignSelf: 'flex-start',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  runBtnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  btnSpinner: {
    width: 14,
    height: 14,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
    display: 'inline-block',
  },
  summaryCard: {
    background: '#1a1a24',
    border: '1px solid #2a2a3a',
    borderRadius: 10,
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  summaryIcon: {
    fontSize: 20,
    color: '#6366f1',
  },
  summaryText: {
    fontSize: 14,
    color: '#9898b0',
  },
  chartSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  chartTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: '#c0c0d8',
  },
};
