import { useEffect, useRef } from 'react';
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type SeriesMarkerBar,
  type Time,
} from 'lightweight-charts';
import type { Candle } from '../api/client';
import { useStore } from '../store';

interface CandleChartProps {
  candles: Candle[];
}

// Kite returns IST timestamps (UTC+5:30). Lightweight-charts treats unix seconds as UTC,
// so we add the IST offset to make the chart display IST wall-clock times correctly.
const IST_OFFSET_S = 19800; // 5h30m in seconds

function toTimestamp(timeStr: string): Time {
  const ms = Date.parse(timeStr);
  if (!isNaN(ms)) return (Math.floor(ms / 1000) + IST_OFFSET_S) as Time;
  return timeStr as Time;
}

function chartColors(isDark: boolean) {
  return {
    layout: {
      background: { color: isDark ? '#0f0f18' : '#f8f8fd' },
      textColor:  isDark ? '#9898b0' : '#3c3c62',
    },
    grid: {
      vertLines: { color: isDark ? '#1a1a28' : '#e4e4ef' },
      horzLines: { color: isDark ? '#1a1a28' : '#e4e4ef' },
    },
    crosshair: {
      vertLine: { color: '#6366f1', style: 1 as const },
      horzLine: { color: '#6366f1', style: 1 as const },
    },
    rightPriceScale: { borderColor: isDark ? '#2a2a3a' : '#dddde8' },
    timeScale: {
      borderColor:    isDark ? '#2a2a3a' : '#dddde8',
      timeVisible:    true,
      secondsVisible: false,
    },
  };
}

export default function CandleChart({ candles }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const theme        = useStore((s) => s.theme);
  // keep a stable ref so the init effect can read it without being a dep
  const themeRef     = useRef(theme);
  themeRef.current   = theme;

  // ── Initialize chart once ─────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = themeRef.current === 'dark';
    const chart  = createChart(containerRef.current, {
      ...chartColors(isDark),
      width:  containerRef.current.clientWidth,
      height: 400,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor:        '#22c55e',
      downColor:      '#ef4444',
      borderUpColor:  '#22c55e',
      borderDownColor:'#ef4444',
      wickUpColor:    '#22c55e',
      wickDownColor:  '#ef4444',
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    const observer = new ResizeObserver((entries) => {
      if (entries[0] && chartRef.current) {
        chartRef.current.applyOptions({ width: entries[0].contentRect.width });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  }, []);

  // ── Repaint chart when theme switches ────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions(chartColors(theme === 'dark'));
  }, [theme]);

  // ── Update data when candles change ──────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;

    const data: CandlestickData[] = candles.map((c) => ({
      time:  toTimestamp(c.time),
      open:  c.open,
      high:  c.high,
      low:   c.low,
      close: c.close,
    }));

    seriesRef.current.setData(data);

    const markers: SeriesMarkerBar<Time>[] = candles
      .filter((c) => c.match)
      .map((c) => ({
        time:     toTimestamp(c.time),
        position: 'belowBar' as const,
        color:    '#22c55e',
        shape:    'arrowUp' as const,
        text:     'Match',
        size:     1,
      }));

    if (seriesRef.current) {
      createSeriesMarkers(seriesRef.current, markers);
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  if (candles.length === 0) {
    return (
      <div style={styles.empty}>
        <span style={styles.emptyIcon}>◈</span>
        <p style={styles.emptyText}>No candle data to display</p>
      </div>
    );
  }

  return <div ref={containerRef} style={styles.chart} />;
}

const styles: Record<string, React.CSSProperties> = {
  chart: {
    width:        '100%',
    height:       400,
    borderRadius: 8,
    overflow:     'hidden',
    border:       '1px solid var(--border)',
  },
  empty: {
    width:          '100%',
    height:         400,
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    border:         '1px solid var(--border)',
    borderRadius:   8,
    background:     'var(--bg-editor)',
    gap:            12,
  },
  emptyIcon: {
    fontSize: 32,
    color:    'var(--border)',
  },
  emptyText: {
    color:    'var(--text-placeholder)',
    fontSize: 14,
    margin:   0,
  },
};
