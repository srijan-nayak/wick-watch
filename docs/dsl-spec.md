# WickWatch DSL Specification

## Overview
A simple, line-oriented pattern scripting language for defining multi-candle conditions. Designed for retail traders — readable without coding experience, with IDE-quality autocomplete in the editor.

## Candle indexing
- `c1` = most recent (latest) candle
- `c2` = one candle before c1
- `cN` = Nth most recent candle
- The number of candles in scope is implicitly defined by the highest `N` used in the pattern

## OHLC properties
```
c1.open
c1.high
c1.low
c1.close
c1.volume
```

## Boolean shorthand properties
```
c1.is_green    # close > open
c1.is_red      # close < open
c1.is_doji     # abs(close - open) / (high - low) < 0.1
```

## Indicators
All params are named and explicit. No positional args, no silent defaults.

```
ema(candle=1, period=20)
rsi(candle=1, period=14)
bb_upper(candle=1, period=20, std=2.0)
bb_lower(candle=1, period=20, std=2.0)
bb_mid(candle=1, period=20)
avg_volume(candle=1, period=10)
atr(candle=1, period=14)
macd(candle=1, fast=12, slow=26, signal=9)
macd_signal(candle=1, fast=12, slow=26, signal=9)
stoch_k(candle=1, period=14)
stoch_d(candle=1, period=14)
```

## Comparison operators
`<`  `>`  `<=`  `>=`  `=`  `!=`

## Logic operators
- Conditions on separate lines are implicitly AND-ed
- Explicit `AND` / `OR` keywords are supported inline
- Parentheses for grouping

```
# These are equivalent:
c1.is_green
c2.is_red

c1.is_green AND c2.is_red
```

```
# OR requires explicit keyword + parens for clarity
(c1.is_green OR c2.is_green) AND c3.is_red
```

## Numeric literals
Plain numbers: `20`, `2.0`, `30`, `0.1`

## Comments
Lines starting with `#` are ignored.

## Example patterns

### Bullish engulfing
```
c2.is_red
c1.is_green
c1.open < c2.close
c1.close > c2.open
```

### Oversold bounce off lower Bollinger Band
```
c2.low < bb_lower(candle=2, period=20, std=2.0)
c1.is_green
c1.close > bb_lower(candle=1, period=20, std=2.0)
rsi(candle=1, period=14) < 35
```

### Three red candles with volume confirmation
```
c3.is_red
c2.is_red
c1.is_red
c3.close > c2.close
c2.close > c1.close
c1.volume > avg_volume(candle=1, period=10)
```

## Lookback budget
When a pattern is compiled, the executor computes:
```
lookback = max(indicator.lookback(params) for each indicator call in pattern)
```
This many extra historical candles are pre-fetched before the detection window to ensure indicators can be computed accurately at every candle in scope.
