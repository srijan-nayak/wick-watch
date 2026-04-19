import { useEffect, useRef } from 'react';
import { useStore } from '../store';

const WS_URL = 'ws://localhost:8000/ws';
const MAX_BACKOFF_MS = 30_000;

interface WsMessage {
  type: 'ping' | 'alert';
  pattern?: string;
  symbol?: string;
  candle_time?: string;
}

export function useWebSocket() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const addAlert = useStore((s) => s.addAlert);
  const setLiveRunning = useStore((s) => s.setLiveRunning);

  const wsRef = useRef<WebSocket | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef<number>(1_000);
  const shouldConnectRef = useRef<boolean>(false);

  const clearRetry = () => {
    if (retryTimeoutRef.current !== null) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  };

  const connect = () => {
    if (!shouldConnectRef.current) return;
    if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      backoffRef.current = 1_000; // reset backoff on successful connect
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(event.data) as WsMessage;
      } catch {
        return;
      }

      if (msg.type === 'ping') return;

      if (
        msg.type === 'alert' &&
        msg.pattern &&
        msg.symbol &&
        msg.candle_time
      ) {
        addAlert({
          pattern: msg.pattern,
          symbol: msg.symbol,
          candle_time: msg.candle_time,
          triggered_at: new Date().toISOString(),
        });
      }
    };

    ws.onclose = () => {
      if (!shouldConnectRef.current) return;

      // Schedule reconnect with exponential backoff
      const delay = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      retryTimeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  };

  const disconnect = () => {
    clearRetry();
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent reconnect loop
      wsRef.current.close();
      wsRef.current = null;
    }
    setLiveRunning(false);
  };

  useEffect(() => {
    if (isAuthenticated) {
      shouldConnectRef.current = true;
      backoffRef.current = 1_000;
      connect();
    } else {
      shouldConnectRef.current = false;
      disconnect();
    }

    return () => {
      shouldConnectRef.current = false;
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);
}
