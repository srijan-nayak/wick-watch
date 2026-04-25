# WickWatch DSL Specification

## Overview
A simple, line-oriented pattern scripting language for defining multi-candle conditions. Designed for retail traders — readable without coding experience, with IDE-quality autocomplete in the editor.

---

## Candle indexing
- `c1` = most recent (current) candle
- `c2` = one candle before c1
- `cN` = Nth most recent candle
- The number of candles in scope is implicitly defined by the highest `N` used in the pattern

---

## OHLC properties
```
c1.open
c1.high
c1.low
c1.close
c1.volume
```

---

## Boolean shorthand properties
```
c1.is_green    # close > open
c1.is_red      # close < open
c1.is_doji     # abs(close - open) / (high - low) < 0.1
```

---

## Arithmetic expressions
Basic arithmetic is supported wherever a numeric value is expected:
```
c1.close - c1.open              # candle body size
c1.high - c1.low                # candle range
(c1.high + c1.low) / 2          # midpoint
c1.volume * 1.5                 # 1.5× volume
```

---

## Indicators
All parameters are **named and explicit**. No positional args, no silent defaults.

### Moving averages
```
ema(candle=1, period=20)           # Exponential moving average
```

### Momentum
```
rsi(candle=1, period=14)           # Relative Strength Index (0–100)
macd(candle=1, fast=12, slow=26, signal=9)          # MACD line
macd_signal(candle=1, fast=12, slow=26, signal=9)   # MACD signal line
stoch_k(candle=1, period=14)       # Stochastic %K
stoch_d(candle=1, period=14)       # Stochastic %D (3-period SMA of %K)
```

### Volatility
```
bb_upper(candle=1, period=20, std=2.0)   # Bollinger Band upper
bb_lower(candle=1, period=20, std=2.0)   # Bollinger Band lower
bb_mid(candle=1, period=20, std=2.0)     # Bollinger Band middle (SMA)
atr(candle=1, period=14)                 # Average True Range
```

### Volume
```
avg_volume(candle=1, period=10)    # Simple moving average of volume
```

### Pivot points
Standard floor pivot points calculated from the **previous trading day's** high, low, and close. Day boundary uses IST midnight — so a candle on 15-Jan uses 14-Jan's OHLC regardless of what time it occurs.

```
pivot_pp(candle=1)    # Pivot Point  = (H + L + C) / 3
pivot_r1(candle=1)    # Resistance 1 = 2 × PP − L
pivot_r2(candle=1)    # Resistance 2 = PP + (H − L)
pivot_r3(candle=1)    # Resistance 3 = H + 2 × (PP − L)
pivot_s1(candle=1)    # Support 1    = 2 × PP − H
pivot_s2(candle=1)    # Support 2    = PP − (H − L)
pivot_s3(candle=1)    # Support 3    = L − 2 × (H − PP)
```

> **Note**: Pivot values are `NaN` for the first trading day in the data slice (no previous day available). The executor skips candle windows containing NaN values automatically.

---

## Comparison operators
`<`  `>`  `<=`  `>=`  `=`  `!=`

---

## Logic operators
- Conditions on **separate lines** are implicitly AND-ed
- Explicit `AND` / `OR` keywords are supported inline
- **Parentheses** for grouping

```
# These are equivalent:
c1.is_green
c2.is_red

c1.is_green AND c2.is_red
```

```
# OR requires explicit keyword
(c1.is_green OR c2.is_green) AND c3.is_red
```

---

## Numeric literals
Plain integers or decimals: `20`, `2.0`, `30`, `0.1`, `14`

---

## Comments
Lines starting with `#` are ignored.

```
# This is a comment
c1.is_green   # inline comments are not supported — use a separate line
```

---

## Lookback budget
When a pattern is compiled, the executor computes:
```
lookback = max(indicator.lookback(params) for each indicator call in pattern)
```
This many extra historical candles are pre-fetched before the detection window to ensure indicators can be computed accurately at every candle in scope.

For pivot indicators the lookback is large (~400 candles) since a full previous trading day's worth of intraday bars must be in scope to derive yesterday's H/L/C.

---

## Example patterns

### Bullish engulfing
```
c2.is_red
c1.is_green
c1.open < c2.close
c1.close > c2.open
```

### Hammer (long lower wick)
```
c1.is_green
c1.low < c1.open - (c1.high - c1.low) * 0.6
c1.close > c1.open
```

### Oversold bounce off lower Bollinger Band
```
c2.low < bb_lower(candle=2, period=20, std=2.0)
c1.is_green
c1.close > bb_lower(candle=1, period=20, std=2.0)
rsi(candle=1, period=14) < 35
```

### EMA crossover with volume confirmation
```
c2.close < ema(candle=2, period=20)
c1.close > ema(candle=1, period=20)
c1.is_green
c1.volume > avg_volume(candle=1, period=20)
```

### Three red candles with volume expansion
```
c3.is_red
c2.is_red
c1.is_red
c3.close > c2.close
c2.close > c1.close
c1.volume > avg_volume(candle=1, period=10)
```

### Bounce off daily S1 pivot
```
c1.is_green
c1.low < pivot_s1(candle=1)
c1.close > pivot_s1(candle=1)
rsi(candle=1, period=14) < 40
```

### Breakout above daily R1 pivot
```
c2.close < pivot_r1(candle=2)
c1.close > pivot_r1(candle=1)
c1.is_green
c1.volume > avg_volume(candle=1, period=20)
```

### RSI divergence setup
```
c1.is_green
rsi(candle=1, period=14) > 50
macd(candle=1, fast=12, slow=26, signal=9) > macd_signal(candle=1, fast=12, slow=26, signal=9)
c1.close > ema(candle=1, period=20)
```
