import { useEffect, useState } from 'react';
import { getIndicators } from '../api/client';
import type { Indicator } from '../api/client';

// ─── TOC definition ────────────────────────────────────────────────────────────

const TOC = [
  { id: 'getting-started', label: 'Getting Started'       },
  { id: 'dsl-overview',    label: 'DSL Overview'          },
  { id: 'candle-refs',     label: '  Candle references'   },
  { id: 'ohlc-fields',     label: '  OHLC & boolean fields'},
  { id: 'arithmetic',      label: '  Arithmetic'           },
  { id: 'operators',       label: '  Operators & logic'    },
  { id: 'examples',        label: '  Full examples'        },
  { id: 'indicator-ref',   label: 'Indicator Reference'   },
] as const;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Code({ children }: { children: string }) {
  return <code style={s.inlineCode}>{children}</code>;
}

function Block({ children }: { children: string }) {
  return (
    <pre style={s.codeBlock}>
      <code>{children.trimStart()}</code>
    </pre>
  );
}

function Section({
  id, title, children,
}: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={s.section}>
      <h2 style={s.h2}>{title}</h2>
      {children}
    </section>
  );
}

function SubSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} style={s.subSection}>
      <h3 style={s.h3}>{title}</h3>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={s.p}>{children}</p>;
}

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div style={s.tableWrap}>
      <table style={s.table}>
        <thead>
          <tr>
            {headers.map((h) => <th key={h} style={s.th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={i % 2 === 0 ? {} : s.trAlt}>
              {row.map((cell, j) => <td key={j} style={s.td}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Indicator card ────────────────────────────────────────────────────────────

function IndicatorCard({ ind }: { ind: Indicator }) {
  const params = Object.entries(ind.params);

  const exampleArgs = params
    .map(([name, info]) => {
      const val = info.default ?? (info.type === 'int' ? 14 : 2.0);
      return `${name}=${val}`;
    })
    .join(', ');
  const example = `${ind.name}(${exampleArgs})`;

  return (
    <div id={`ind-${ind.name}`} style={s.indCard}>
      <div style={s.indHeader}>
        <span style={s.indName}>{ind.name}</span>
        <span style={s.indLabel}>{ind.label}</span>
      </div>
      <p style={s.indDesc}>{ind.description}</p>

      <Table
        headers={['Parameter', 'Type', 'Default', 'Description']}
        rows={params.map(([name, info]) => [
          <Code key={name}>{name}</Code>,
          <span style={s.typeChip}>{info.type}</span>,
          info.default !== null
            ? <Code>{String(info.default)}</Code>
            : <span style={s.muted}>required</span>,
          info.description,
        ])}
      />

      <div style={s.exampleRow}>
        <span style={s.exampleLabel}>Example</span>
        <pre style={s.exampleCode}><code>{example}</code></pre>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Docs() {
  const [indicators, setIndicators] = useState<Indicator[]>([]);

  useEffect(() => {
    getIndicators().then(setIndicators).catch(() => {});
  }, []);

  return (
    <div style={s.root}>

      {/* ── Sticky TOC ─────────────────────────────────────────────────────── */}
      <aside style={s.toc}>
        <p style={s.tocTitle}>On this page</p>
        <ul style={s.tocList}>
          {TOC.map(({ id, label }) => (
            <li key={id}>
              <button
                style={{
                  ...s.tocLink,
                  ...(label.startsWith('  ') ? s.tocLinkIndent : {}),
                }}
                onClick={() => scrollTo(id)}
              >
                {label.trim()}
              </button>
            </li>
          ))}
          {indicators.length > 0 && (
            <>
              <li style={s.tocDivider} />
              {indicators.map((ind) => (
                <li key={ind.name}>
                  <button
                    style={{ ...s.tocLink, ...s.tocLinkIndent }}
                    onClick={() => scrollTo(`ind-${ind.name}`)}
                  >
                    {ind.name}()
                  </button>
                </li>
              ))}
            </>
          )}
        </ul>
      </aside>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <article style={s.content}>

        <Section id="getting-started" title="Getting Started">
          <P>
            WickWatch lets you define multi-candle patterns in a simple DSL,
            backtest them against historical Kite data, and run them live during
            market hours. Here's the workflow:
          </P>
          <Table
            headers={['Step', 'Where', 'What to do']}
            rows={[
              ['1', 'Tickers', 'Search for instruments (e.g. RELIANCE on NSE) and add them to your watchlist. The app resolves the instrument token automatically.'],
              ['2', 'Patterns', 'Create a named pattern. Pick a candle interval (e.g. 5minute) and write your DSL condition.'],
              ['3', 'Backtest', 'Select a pattern + ticker + date range and run a backtest. Matches are highlighted on the candlestick chart.'],
              ['4', 'Live', 'Start live detection. WickWatch streams real-time candles and fires alerts when a pattern matches.'],
            ]}
          />
        </Section>

        <Section id="dsl-overview" title="DSL Reference">
          <P>
            The WickWatch DSL is a declarative condition language. Each pattern is a
            set of boolean conditions that must all be true for a match. A newline
            between conditions acts as an implicit <Code>AND</Code>.
          </P>

          <SubSection id="candle-refs" title="Candle references">
            <P>
              Candles are referenced by index: <Code>c1</Code> is the most recent
              (current) candle, <Code>c2</Code> is one before it, and so on.
            </P>
            <Table
              headers={['Reference', 'Meaning']}
              rows={[
                [<Code>c1</Code>, 'Most recent candle (the one being evaluated)'],
                [<Code>c2</Code>, 'One candle before c1'],
                [<Code>c3</Code>, 'Two candles before c1'],
                [<Code>cN</Code>, 'N − 1 candles before c1'],
              ]}
            />
          </SubSection>

          <SubSection id="ohlc-fields" title="OHLC & boolean fields">
            <P>Access candle data using dot notation:</P>
            <Table
              headers={['Field', 'Type', 'Description']}
              rows={[
                [<Code>cN.open</Code>,     'number',  'Open price'],
                [<Code>cN.high</Code>,     'number',  'High price'],
                [<Code>cN.low</Code>,      'number',  'Low price'],
                [<Code>cN.close</Code>,    'number',  'Close price'],
                [<Code>cN.volume</Code>,   'number',  'Volume'],
                [<Code>cN.is_green</Code>, 'boolean', 'True when close > open'],
                [<Code>cN.is_red</Code>,   'boolean', 'True when close < open'],
                [<Code>cN.is_doji</Code>,  'boolean', 'True when |close − open| is very small relative to the range'],
              ]}
            />
          </SubSection>

          <SubSection id="arithmetic" title="Arithmetic expressions">
            <P>
              You can use <Code>+</Code>, <Code>-</Code>, <Code>*</Code>, <Code>/</Code>{' '}
              on any numeric value or indicator call. Standard precedence applies
              (<Code>*</Code> / <Code>/</Code> before <Code>+</Code> / <Code>-</Code>),
              and parentheses can override it.
            </P>
            <Block>{`
# Body size > twice the lower wick
(c1.close - c1.open) > (c1.open - c1.low) * 2

# Gap between closes as a fraction of the prior close
(c1.close - c2.close) / c2.close > 0.01
`}</Block>
          </SubSection>

          <SubSection id="operators" title="Operators & logic">
            <P>
              Comparison operators produce boolean results. Logical operators
              combine booleans. Parentheses group sub-expressions.
            </P>
            <Table
              headers={['Operator', 'Meaning']}
              rows={[
                [<Code>{'>'}</Code>,  'Greater than'],
                [<Code>{'<'}</Code>,  'Less than'],
                [<Code>{'>='}</Code>, 'Greater than or equal'],
                [<Code>{'<='}</Code>, 'Less than or equal'],
                [<Code>{'='}</Code>,  'Equal'],
                [<Code>{'!='}</Code>, 'Not equal'],
                [<Code>AND</Code>,    'Both conditions must be true'],
                [<Code>OR</Code>,     'At least one condition must be true'],
              ]}
            />
            <P>
              A <strong>newline</strong> between two conditions is equivalent to{' '}
              <Code>AND</Code>. These two patterns are identical:
            </P>
            <Block>{`
c1.is_green
c1.close > c1.open * 1.005

# same as:
c1.is_green AND c1.close > c1.open * 1.005
`}</Block>
            <P>
              Use <Code>#</Code> to add comments — everything after <Code>#</Code>{' '}
              on a line is ignored.
            </P>
            <Block>{`
# Bullish engulfing
c2.is_red               # prior candle is bearish
c1.is_green             # current candle is bullish
c1.open < c2.close      # opens below prior close (gap down or at close)
c1.close > c2.open      # closes above prior open
`}</Block>
          </SubSection>

          <SubSection id="examples" title="Full examples">
            <P><strong>Hammer candle</strong> — long lower wick, small body near the top:</P>
            <Block>{`
c1.is_green
# lower wick is at least 2× the body
(c1.open - c1.low) > (c1.close - c1.open) * 2
# upper wick is small
(c1.high - c1.close) < (c1.close - c1.open) * 0.5
`}</Block>

            <P><strong>RSI oversold bounce</strong> — RSI crosses back above 30:</P>
            <Block>{`
rsi(candle=2, period=14) < 30
rsi(candle=1, period=14) > 30
c1.is_green
`}</Block>

            <P><strong>EMA crossover</strong> — fast EMA crosses above slow EMA:</P>
            <Block>{`
# Prior candle: fast below slow
ema(candle=2, period=9) < ema(candle=2, period=21)
# Current candle: fast above slow
ema(candle=1, period=9) > ema(candle=1, period=21)
`}</Block>

            <P><strong>Bollinger squeeze breakout</strong> — close breaks above upper band with volume:</P>
            <Block>{`
c1.close > bb_upper(candle=1, period=20, std=2.0)
c1.volume > avg_volume(candle=1, period=20) * 1.5
`}</Block>
          </SubSection>
        </Section>

        <Section id="indicator-ref" title="Indicator Reference">
          <P>
            All indicators take a <Code>candle</Code> parameter (the candle index,
            e.g. <Code>1</Code> for the latest) plus indicator-specific parameters.
            Parameters are always named — no positional arguments.
          </P>
          {indicators.length === 0 ? (
            <p style={s.muted}>Loading indicators…</p>
          ) : (
            indicators.map((ind) => <IndicatorCard key={ind.name} ind={ind} />)
          )}
        </Section>

      </article>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    gap: 0,
    minHeight: '100vh',
    alignItems: 'flex-start',
  },

  // TOC sidebar
  toc: {
    width: 200,
    minWidth: 200,
    position: 'sticky',
    top: 0,
    height: '100vh',       // fills the viewport height exactly so it sticks properly
    overflowY: 'auto',
    padding: '28px 0 28px 20px',
    borderRight: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  tocTitle: {
    margin: '0 0 12px',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-placeholder)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  tocList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  tocLink: {
    background: 'none',
    border: 'none',
    color: 'var(--text-faint)',
    fontSize: 12,
    padding: '4px 0',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    transition: 'color 0.15s',
  },
  tocLinkIndent: {
    paddingLeft: 12,
    color: 'var(--text-disabled)',
    fontSize: 11,
  },
  tocDivider: {
    height: 1,
    background: 'var(--border-subtle)',
    margin: '8px 0',
  },

  // Content area
  content: {
    flex: 1,
    padding: '28px 48px 64px 40px',
    maxWidth: 820,
    minWidth: 0,
  },

  // Sections
  section: {
    marginBottom: 56,
  },
  subSection: {
    marginTop: 28,
    marginBottom: 28,
    paddingLeft: 0,
  },
  h2: {
    margin: '0 0 16px',
    fontSize: 22,
    fontWeight: 800,
    color: 'var(--text-primary)',
    paddingBottom: 12,
    borderBottom: '1px solid var(--border)',
  },
  h3: {
    margin: '0 0 10px',
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-muted)',
  },
  p: {
    margin: '0 0 12px',
    fontSize: 14,
    color: 'var(--text-dim)',
    lineHeight: 1.7,
  },

  // Inline code & code blocks
  inlineCode: {
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    fontSize: '0.85em',
    background: 'var(--accent-bg)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    padding: '1px 6px',
    color: 'var(--accent-light)',
  },
  codeBlock: {
    background: 'var(--bg-editor)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '14px 18px',
    margin: '12px 0',
    overflow: 'auto',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    fontSize: 12.5,
    color: 'var(--text-secondary)',
    lineHeight: 1.65,
  },

  // Tables
  tableWrap: {
    overflowX: 'auto',
    margin: '12px 0',
    borderRadius: 8,
    border: '1px solid var(--border)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    background: 'var(--bg-card)',
    color: 'var(--text-faint)',
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    padding: '10px 14px',
    textAlign: 'left' as const,
    borderBottom: '1px solid var(--border)',
  },
  td: {
    padding: '9px 14px',
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border-subtle)',
    verticalAlign: 'top' as const,
    lineHeight: 1.5,
  },
  trAlt: {
    background: 'var(--bg-alt)',
  },

  // Indicator cards
  indCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '20px 24px',
    marginBottom: 20,
  },
  indHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 12,
    marginBottom: 8,
  },
  indName: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--accent-light)',
  },
  indLabel: {
    fontSize: 12,
    color: 'var(--text-disabled)',
    fontWeight: 500,
  },
  indDesc: {
    margin: '0 0 14px',
    fontSize: 13,
    color: 'var(--text-dim)',
    lineHeight: 1.6,
  },
  exampleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    flexWrap: 'wrap' as const,
  },
  exampleLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-placeholder)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    flexShrink: 0,
  },
  exampleCode: {
    margin: 0,
    background: 'var(--bg-editor)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '6px 14px',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    fontSize: 12,
    color: 'var(--code-highlight)',
    overflowX: 'auto' as const,
  },
  typeChip: {
    display: 'inline-block',
    background: 'var(--accent-bg)',
    border: '1px solid var(--border-mid)',
    borderRadius: 4,
    padding: '1px 7px',
    fontSize: 11,
    color: 'var(--text-faint)',
    fontFamily: '"JetBrains Mono", monospace',
  },
  muted: {
    color: 'var(--text-placeholder)',
    fontSize: 13,
  },
};
