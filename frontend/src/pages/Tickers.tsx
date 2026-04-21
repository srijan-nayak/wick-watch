import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  getTickers,
  createTicker,
  deleteTicker,
  searchInstruments,
} from '../api/client';
import type { Ticker } from '../api/client';
import { useStore } from '../store';

export default function Tickers() {
  const tickers = useStore((s) => s.tickers);
  const setTickers = useStore((s) => s.setTickers);

  const [query, setQuery] = useState('');
  const [exchange, setExchange] = useState('NSE');
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const loadTickers = useCallback(async () => {
    try {
      const data = await getTickers();
      setTickers(data);
    } catch {
      toast.error('Failed to load tickers');
    }
  }, [setTickers]);

  useEffect(() => {
    loadTickers();
  }, [loadTickers]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const results = await searchInstruments(exchange, query.trim());
      setSearchResults(results.map((r) => ({ symbol: r.symbol, name: r.name })));
      if (results.length === 0) toast.info('No instruments found');
    } catch {
      toast.error('Instrument search failed. Is the backend running?');
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async (symbol: string) => {
    const exists = tickers.some(
      (t) => t.symbol === symbol && t.exchange === exchange,
    );
    if (exists) {
      toast.info(`${exchange}:${symbol} is already tracked`);
      return;
    }
    try {
      const created = await createTicker({ symbol, exchange });
      setTickers([...tickers, created]);
      setSearchResults([]);
      setQuery('');
      toast.success(`Added ${exchange}:${symbol}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add ticker');
    }
  };

  const handleDelete = async (t: Ticker) => {
    try {
      await deleteTicker(t.id);
      setTickers(tickers.filter((tk) => tk.id !== t.id));
      toast.success(`Removed ${t.symbol}`);
    } catch {
      toast.error('Failed to remove ticker');
    }
  };

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <h1 style={styles.pageTitle}>Tickers</h1>
        <p style={styles.pageSubtitle}>
          Manage the instruments to monitor for pattern detection.
        </p>
      </div>

      {/* Search section */}
      <div style={styles.searchCard}>
        <h3 style={styles.sectionTitle}>Add Instrument</h3>
        <div style={styles.searchRow}>
          <select
            style={styles.exchangeSelect}
            value={exchange}
            onChange={(e) => setExchange(e.target.value)}
          >
            <option value="NSE">NSE</option>
            <option value="BSE">BSE</option>
            <option value="NFO">NFO</option>
          </select>
          <input
            style={styles.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol, e.g. RELIANCE"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            style={{ ...styles.searchBtn, ...(searching ? styles.btnDisabled : {}) }}
            onClick={handleSearch}
            disabled={searching}
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div style={styles.searchResults}>
            {searchResults.map((inst) => (
              <div key={inst.symbol} style={styles.searchResultItem}>
                <div style={styles.instInfo}>
                  <span style={styles.instSymbol}>{inst.symbol}</span>
                  {inst.name && inst.name !== inst.symbol && (
                    <span style={styles.instMeta}>{inst.name}</span>
                  )}
                </div>
                <button
                  style={styles.addBtn}
                  onClick={() => handleAdd(inst.symbol)}
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active tickers */}
      <div style={styles.tickersCard}>
        <h3 style={styles.sectionTitle}>
          Active Tickers
          <span style={styles.count}>{tickers.length}</span>
        </h3>

        {tickers.length === 0 && (
          <p style={styles.emptyMsg}>No tickers added yet. Search and add one above.</p>
        )}

        <div style={styles.tickerList}>
          {tickers.map((t) => (
            <div key={t.id} style={styles.tickerItem}>
              <div style={styles.tickerInfo}>
                <span style={styles.tickerSymbol}>{t.symbol}</span>
                <span style={styles.tickerExchange}>{t.exchange}</span>
              </div>
              <div style={styles.tickerActions}>
                <span
                  style={{
                    ...styles.statusDot,
                    background: t.is_active ? '#22c55e' : '#4a4a6a',
                  }}
                />
                <button
                  style={styles.removeBtn}
                  onClick={() => handleDelete(t)}
                  title="Remove ticker"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
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
    maxWidth: 800,
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
  searchCard: {
    background: '#1a1a24',
    border: '1px solid #2a2a3a',
    borderRadius: 12,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: '#c0c0d8',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  count: {
    background: '#2a2a3a',
    borderRadius: 10,
    padding: '1px 8px',
    fontSize: 11,
    color: '#7878a8',
    fontWeight: 600,
  },
  searchRow: {
    display: 'flex',
    gap: 8,
  },
  exchangeSelect: {
    background: '#111118',
    border: '1px solid #2a2a3a',
    borderRadius: 8,
    color: '#e8e8f0',
    fontSize: 13,
    padding: '10px 32px 10px 12px',
    outline: 'none',
    cursor: 'pointer',
    minWidth: 80,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%237878a8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
  },
  searchInput: {
    flex: 1,
    background: '#111118',
    border: '1px solid #2a2a3a',
    borderRadius: 8,
    color: '#e8e8f0',
    fontSize: 13,
    padding: '10px 14px',
    outline: 'none',
  },
  searchBtn: {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  btnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  searchResults: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    maxHeight: 240,
    overflowY: 'auto',
  },
  searchResultItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    background: '#111118',
    borderRadius: 8,
    border: '1px solid #1e1e2e',
  },
  instInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  instSymbol: {
    fontSize: 13,
    fontWeight: 600,
    color: '#d0d0e8',
  },
  instMeta: {
    fontSize: 11,
    color: '#5a5a7a',
  },
  addBtn: {
    background: 'transparent',
    border: '1px solid #6366f1',
    color: '#a5b4fc',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  tickersCard: {
    background: '#1a1a24',
    border: '1px solid #2a2a3a',
    borderRadius: 12,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  emptyMsg: {
    margin: 0,
    fontSize: 13,
    color: '#4a4a6a',
  },
  tickerList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  tickerItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: '#111118',
    borderRadius: 8,
    border: '1px solid #1e1e2e',
  },
  tickerInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  tickerSymbol: {
    fontSize: 14,
    fontWeight: 600,
    color: '#d0d0e8',
  },
  tickerExchange: {
    fontSize: 11,
    color: '#5a5a7a',
  },
  tickerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  removeBtn: {
    background: 'transparent',
    border: '1px solid #3a2a2a',
    color: '#9a5a5a',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 12,
    cursor: 'pointer',
  },
};
