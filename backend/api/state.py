"""
App-level singletons. All modules import from here — never construct
KiteClient or LiveStream in route handlers.
"""
from __future__ import annotations
from kite.client import KiteClient
from kite.stream import LiveStream

_kite_client: KiteClient | None = None
_live_stream: LiveStream | None = None
_active_tickers: list | None = None


def get_kite_client() -> KiteClient:
    if _kite_client is None:
        raise RuntimeError("not_authenticated")
    return _kite_client


def set_kite_client(client: KiteClient) -> None:
    global _kite_client
    _kite_client = client


def clear_kite_client() -> None:
    global _kite_client
    _kite_client = None


def get_live_stream() -> LiveStream | None:
    return _live_stream


def set_live_stream(stream: LiveStream) -> None:
    global _live_stream
    _live_stream = stream


def clear_live_stream() -> None:
    global _live_stream
    _live_stream = None


def is_live_running() -> bool:
    return _live_stream is not None


def get_active_tickers() -> list | None:
    return _active_tickers


def set_active_tickers(tickers: list) -> None:
    global _active_tickers
    _active_tickers = tickers


def clear_active_tickers() -> None:
    global _active_tickers
    _active_tickers = None
