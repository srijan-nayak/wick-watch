import { useEffect, useState } from 'react';
import {
  getHistory,
  getPatterns,
  getTickers,
  clearHistory,
  type Pattern,
  type Ticker,
  type PatternMatchRecord,
  type HistoryPage,
} from '../api/client';
import SearchableSelect from '../components/SearchableSelect';

const PAGE_SIZE = 50;

function formatLocalTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default function History() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [tickers,  setTickers]  = useState<Ticker[]>([]);

  useEffect(() => {
    getPatterns().then(setPatterns).catch(() => {});
    getTickers().then(setTickers).catch(() => {});
  }, []);

  const [patternFilter, setPatternFilter] = useState('');
  const [tickerFilter,  setTickerFilter]  = useState('');
  const [page,          setPage]          = useState(1);

  const [data,    setData]    = useState<HistoryPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Fetch whenever filters or page change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getHistory({
      page,
      page_size: PAGE_SIZE,
      pattern_id: patternFilter ? Number(patternFilter) : undefined,
      ticker_symbol: tickerFilter || undefined,
    })
      .then((res) => { if (!cancelled) setData(res); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, patternFilter, tickerFilter]);

  // Reset to page 1 when filters change
  const handlePatternFilter = (v: string) => { setPatternFilter(v); setPage(1); };
  const handleTickerFilter  = (v: string) => { setTickerFilter(v);  setPage(1); };

  const handleClear = async () => {
    if (!window.confirm('Clear all pattern match history? This cannot be undone.')) return;
    await clearHistory();
    setPage(1);
    setData(null);
    // Re-trigger fetch
    setLoading(true);
    try {
      const res = await getHistory({ page: 1, page_size: PAGE_SIZE, });
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const patternOptions = [
    { value: '', label: 'All patterns' },
    ...patterns.map((p) => ({ value: String(p.id), label: p.name, sublabel: p.interval })),
  ];

  const tickerOptions = [
    { value: '', label: 'All tickers' },
    ...tickers.map((t) => ({ value: t.symbol, label: t.symbol, sublabel: t.exchange })),
  ];

  const total  = data?.total     ?? 0;
  const pages  = data?.pages     ?? 1;
  const items  = data?.items     ?? [];
  const start  = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end    = Math.min(page * PAGE_SIZE, total);

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Match History</h1>
          <p style={s.subtitle}>All pattern matches from live detection</p>
        </div>
        <button style={s.clearBtn} onClick={handleClear}>
          Clear history
        </button>
      </div>

      {/* Filters */}
      <div style={s.filters}>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>Pattern</label>
          <SearchableSelect
            options={patternOptions}
            value={patternFilter}
            onChange={handlePatternFilter}
            placeholder="All patterns"
          />
        </div>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>Ticker</label>
          <SearchableSelect
            options={tickerOptions}
            value={tickerFilter}
            onChange={handleTickerFilter}
            placeholder="All tickers"
          />
        </div>
      </div>

      {/* Table area */}
      <div style={s.tableCard}>
        {loading && (
          <div style={s.centered}>
            <div style={s.spinner} />
          </div>
        )}

        {!loading && error && (
          <div style={s.errorMsg}>{error}</div>
        )}

        {!loading && !error && items.length === 0 && (
          <div style={s.emptyState}>
            <span style={s.emptyIcon}>◷</span>
            <p style={s.emptyText}>No matches found</p>
            <p style={s.emptyHint}>Start live detection to see pattern matches here.</p>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Candle Time</th>
                <th style={s.th}>Pattern</th>
                <th style={s.th}>Ticker</th>
                <th style={s.th}>Interval</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r: PatternMatchRecord, idx: number) => (
                <tr
                  key={r.id}
                  style={idx % 2 === 0 ? s.rowEven : s.rowOdd}
                >
                  <td style={s.td}>{formatLocalTime(r.candle_time)}</td>
                  <td style={s.td}>
                    <span style={s.patternName}>{r.pattern_name}</span>
                  </td>
                  <td style={s.td}>
                    <span style={s.tickerSymbol}>{r.ticker_symbol}</span>
                    <span style={s.exchange}>{r.exchange}</span>
                  </td>
                  <td style={s.td}>
                    <span style={s.interval}>{r.interval}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && !error && total > 0 && (
        <div style={s.pagination}>
          <span style={s.paginationInfo}>
            {start}–{end} of {total} matches
          </span>
          <div style={s.paginationControls}>
            <button
              style={{ ...s.pageBtn, ...(page <= 1 ? s.pageBtnDisabled : {}) }}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            {Array.from({ length: pages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 2)
              .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) {
                  acc.push('...');
                }
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                p === '...' ? (
                  <span key={`ellipsis-${idx}`} style={s.ellipsis}>…</span>
                ) : (
                  <button
                    key={p}
                    style={{ ...s.pageBtn, ...(p === page ? s.pageBtnActive : {}) }}
                    onClick={() => setPage(p as number)}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              style={{ ...s.pageBtn, ...(page >= pages ? s.pageBtnDisabled : {}) }}
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    padding: '32px 40px',
    maxWidth: 1100,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-dim)',
    margin: '4px 0 0',
  },
  clearBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-dim)',
    fontSize: 13,
    padding: '8px 16px',
    cursor: 'pointer',
    transition: 'border-color 0.15s, color 0.15s',
  },
  filters: {
    display: 'flex',
    gap: 16,
    alignItems: 'flex-end',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 200,
    flex: 1,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  tableCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 120,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-base)',
    whiteSpace: 'nowrap',
  },
  td: {
    fontSize: 13,
    color: 'var(--text-primary)',
    padding: '11px 16px',
    verticalAlign: 'middle',
  },
  rowEven: {
    background: 'transparent',
  },
  rowOdd: {
    background: 'var(--bg-base)',
  },
  patternName: {
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  tickerSymbol: {
    fontWeight: 600,
    color: 'var(--accent-light)',
    marginRight: 6,
  },
  exchange: {
    fontSize: 11,
    color: 'var(--text-faint)',
  },
  interval: {
    fontSize: 12,
    color: 'var(--text-dim)',
    fontFamily: 'monospace',
  },
  centered: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 0',
  },
  spinner: {
    width: 28,
    height: 28,
    border: '3px solid var(--border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  errorMsg: {
    color: 'var(--error)',
    padding: '24px 20px',
    fontSize: 13,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '56px 0',
    gap: 8,
  },
  emptyIcon: {
    fontSize: 36,
    color: 'var(--text-ghost)',
  },
  emptyText: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text-dim)',
    margin: 0,
  },
  emptyHint: {
    fontSize: 13,
    color: 'var(--text-ghost)',
    margin: 0,
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  paginationInfo: {
    fontSize: 13,
    color: 'var(--text-dim)',
  },
  paginationControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  pageBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-dim)',
    fontSize: 13,
    padding: '6px 12px',
    cursor: 'pointer',
    transition: 'border-color 0.15s, color 0.15s, background 0.15s',
    minWidth: 36,
  },
  pageBtnActive: {
    background: 'var(--accent)',
    borderColor: 'var(--accent)',
    color: '#fff',
  },
  pageBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  ellipsis: {
    fontSize: 13,
    color: 'var(--text-ghost)',
    padding: '0 4px',
  },
};
