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

interface CandleChartProps {
  candles: Candle[];
}

function toTimestamp(timeStr: string): Time {
  // lightweight-charts expects Unix timestamp in seconds or 'YYYY-MM-DD'
  const ms = Date.parse(timeStr);
  if (!isNaN(ms)) return Math.floor(ms / 1000) as Time;
  return timeStr as Time;
}

export default function CandleChart({ candles }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // Initialize chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0f0f18' },
        textColor: '#9898b0',
      },
      grid: {
        vertLines: { color: '#1a1a28' },
        horzLines: { color: '#1a1a28' },
      },
      crosshair: {
        vertLine: { color: '#6366f1', style: 1 },
        horzLine: { color: '#6366f1', style: 1 },
      },
      rightPriceScale: {
        borderColor: '#2a2a3a',
      },
      timeScale: {
        borderColor: '#2a2a3a',
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: 400,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // ResizeObserver for auto-resize
    const observer = new ResizeObserver((entries) => {
      if (entries[0] && chartRef.current) {
        chartRef.current.applyOptions({
          width: entries[0].contentRect.width,
        });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Update data when candles change
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;

    const data: CandlestickData[] = candles.map((c) => ({
      time: toTimestamp(c.time),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    seriesRef.current.setData(data);

    // Add markers for matches using v5 createSeriesMarkers API
    const markers: SeriesMarkerBar<Time>[] = candles
      .filter((c) => c.match)
      .map((c) => ({
        time: toTimestamp(c.time),
        position: 'belowBar' as const,
        color: '#22c55e',
        shape: 'arrowUp' as const,
        text: 'Match',
        size: 1,
      }));

    if (seriesRef.current) {
      createSeriesMarkers(seriesRef.current, markers);
    }

    // Fit content
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
    width: '100%',
    height: 400,
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid #2a2a3a',
  },
  empty: {
    width: '100%',
    height: 400,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #2a2a3a',
    borderRadius: 8,
    background: '#0f0f18',
    gap: 12,
  },
  emptyIcon: {
    fontSize: 32,
    color: '#2a2a3a',
  },
  emptyText: {
    color: '#4a4a6a',
    fontSize: 14,
    margin: 0,
  },
};
