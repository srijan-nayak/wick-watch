from __future__ import annotations
from dataclasses import dataclass, field
from typing import Union

OHLC_FIELDS = {"open", "high", "low", "close", "volume"}
BOOL_PROPS = {"is_green", "is_red", "is_doji"}
COMPARISON_OPS = {"<", ">", "<=", ">=", "!=", "="}


@dataclass
class CandleField:
    candle_index: int  # 1 = most recent
    field: str         # open | high | low | close | volume


@dataclass
class BoolProp:
    candle_index: int
    prop: str  # is_green | is_red | is_doji


@dataclass
class IndicatorCall:
    name: str
    params: dict[str, int | float]


@dataclass
class NumberLiteral:
    value: float


@dataclass
class BinaryArith:
    left: 'ValueNode'
    op: str   # '+' | '-' | '*' | '/'
    right: 'ValueNode'


ValueNode = Union[CandleField, IndicatorCall, NumberLiteral, BinaryArith]


@dataclass
class Comparison:
    left: 'ValueNode'
    op: str
    right: 'ValueNode'


@dataclass
class LogicalAnd:
    left: BoolNode
    right: BoolNode


@dataclass
class LogicalOr:
    left: BoolNode
    right: BoolNode


BoolNode = Union[BoolProp, Comparison, LogicalAnd, LogicalOr]


@dataclass
class PatternAST:
    conditions: list[BoolNode]  # top-level conditions are implicitly AND-ed
