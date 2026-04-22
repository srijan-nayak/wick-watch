import { useRef, useEffect, useCallback } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import type { editor, languages } from 'monaco-editor';
import type { Indicator } from '../api/client';
import { validateDsl } from '../api/client';

interface DslEditorProps {
  value: string;
  onChange: (v: string) => void;
  indicators: Indicator[];
  readOnly?: boolean;
}

const LANGUAGE_ID = 'wickwatch-dsl';
const LINT_OWNER  = 'dsl-lint';
const LINT_DELAY  = 600; // ms debounce before sending to backend

const OHLC_FIELDS      = ['open', 'high', 'low', 'close', 'volume'];
const BOOL_PROPS        = ['is_green', 'is_red', 'is_doji'];
const CANDLE_FIELDS     = [...OHLC_FIELDS, ...BOOL_PROPS];
const KEYWORDS          = ['AND', 'OR'];
const CANDLE_SUGGESTIONS = ['c1', 'c2', 'c3', 'c4', 'c5'];

function buildTokensProvider(): languages.IMonarchLanguage {
  return {
    defaultToken: 'invalid',
    keywords: KEYWORDS,
    boolProps: BOOL_PROPS,
    ohlcFields: OHLC_FIELDS,

    tokenizer: {
      root: [
        [/#.*$/, 'comment'],
        [/\bc\d+\b/, 'candle-ref'],
        [/\b(is_green|is_red|is_doji)\b/, 'bool-prop'],
        [/\b(open|high|low|close|volume)\b/, 'ohlc-field'],
        [/\b(AND|OR)\b/, 'keyword'],
        [/\b\d+(\.\d+)?\b/, 'number'],
        [/[><=!]+/, 'operator'],
        [/[.,()]/, 'delimiter'],
        [/\s+/, 'white'],
        [/[a-zA-Z_]\w*/, 'identifier'],
      ],
    },
  };
}

export default function DslEditor({ value, onChange, indicators, readOnly }: DslEditorProps) {
  const monaco = useMonaco();
  const registeredRef          = useRef(false);
  const completionDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const editorRef              = useRef<editor.IStandaloneCodeEditor | null>(null);
  const lintTimerRef           = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Language registration (once) ────────────────────────────────────────────
  useEffect(() => {
    if (!monaco || registeredRef.current) return;
    registeredRef.current = true;

    if (!monaco.languages.getLanguages().some((l) => l.id === LANGUAGE_ID)) {
      monaco.languages.register({ id: LANGUAGE_ID });
    }

    monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, buildTokensProvider());

    monaco.editor.defineTheme('wickwatch-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment',    foreground: '5a5a7a', fontStyle: 'italic' },
        { token: 'candle-ref', foreground: 'a5b4fc' },
        { token: 'bool-prop',  foreground: 'f9a8d4' },
        { token: 'ohlc-field', foreground: '6ee7b7' },
        { token: 'keyword',    foreground: 'fbbf24', fontStyle: 'bold' },
        { token: 'number',     foreground: 'fb923c' },
        { token: 'operator',   foreground: 'e879f9' },
        { token: 'delimiter',  foreground: '94a3b8' },
        { token: 'identifier', foreground: '93c5fd' },
      ],
      colors: {
        'editor.background':            '#0f0f18',
        'editor.foreground':            '#c4c4e0',
        'editor.lineHighlightBackground': '#1a1a28',
        'editorLineNumber.foreground':  '#3a3a5a',
        'editorCursor.foreground':      '#6366f1',
        'editor.selectionBackground':   '#3730a350',
      },
    });
  }, [monaco]);

  // ── Completion provider (refreshed when indicators change) ───────────────────
  useEffect(() => {
    if (!monaco) return;

    completionDisposableRef.current?.dispose();

    const indicatorNames = indicators.map((i) => i.name);

    completionDisposableRef.current = monaco.languages.registerCompletionItemProvider(
      LANGUAGE_ID,
      {
        triggerCharacters: ['.', '(', ' '],
        provideCompletionItems(
          model: editor.ITextModel,
          position: { lineNumber: number; column: number },
        ): languages.ProviderResult<languages.CompletionList> {
          const textBefore = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          const word  = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber:   position.lineNumber,
            startColumn:     word.startColumn,
            endColumn:       word.endColumn,
          };

          // After a dot → suggest OHLC fields + bool props
          if (textBefore.match(/\b(c\d+)\.\s*$/)) {
            return {
              suggestions: CANDLE_FIELDS.map((f) => ({
                label:         f,
                kind:          BOOL_PROPS.includes(f)
                  ? monaco.languages.CompletionItemKind.Property
                  : monaco.languages.CompletionItemKind.Field,
                insertText:    f,
                detail:        BOOL_PROPS.includes(f) ? 'boolean' : 'number',
                documentation: BOOL_PROPS.includes(f)
                  ? `True if the candle ${f.replace('is_', 'is ')}`
                  : `${f.charAt(0).toUpperCase() + f.slice(1)} price`,
                range,
              })),
            };
          }

          // After indicator name + '(' → param hints
          const indMatch = textBefore.match(
            new RegExp(`\\b(${indicatorNames.join('|')})\\(\\s*$`),
          );
          if (indMatch) {
            const ind = indicators.find((i) => i.name === indMatch[1]);
            if (ind) {
              return {
                suggestions: Object.entries(ind.params).map(([param, info]) => ({
                  label:         `${param}=`,
                  kind:          monaco.languages.CompletionItemKind.Variable,
                  insertText:    `${param}=`,
                  detail:        `${info.type}${info.default !== null ? ` (default: ${info.default})` : ''}`,
                  documentation: info.description,
                  range,
                })),
              };
            }
          }

          // After 'c' → suggest c1..c5
          if (textBefore.match(/\bc\s*$/)) {
            return {
              suggestions: CANDLE_SUGGESTIONS.map((c) => ({
                label:         c,
                kind:          monaco.languages.CompletionItemKind.Variable,
                insertText:    c,
                detail:        'Candle reference',
                documentation: `Reference to candle ${c.slice(1)} (1 = most recent)`,
                range,
              })),
            };
          }

          // Top-level: candles + keywords + indicators
          return {
            suggestions: [
              ...CANDLE_SUGGESTIONS.map((c) => ({
                label: c, kind: monaco.languages.CompletionItemKind.Variable,
                insertText: c, detail: 'Candle reference', range,
              })),
              ...KEYWORDS.map((kw) => ({
                label: kw, kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: kw, detail: 'Logical operator', range,
              })),
              ...indicators.map((ind) => ({
                label: ind.name, kind: monaco.languages.CompletionItemKind.Function,
                insertText: `${ind.name}(`, detail: ind.label,
                documentation: ind.description, range,
              })),
            ],
          };
        },
      },
    );

    return () => { completionDisposableRef.current?.dispose(); };
  }, [monaco, indicators]);

  // ── Linting: debounced call to /api/dsl/validate ─────────────────────────────
  const runLint = useCallback(
    (dsl: string) => {
      if (!monaco || !editorRef.current) return;

      if (lintTimerRef.current) clearTimeout(lintTimerRef.current);

      lintTimerRef.current = setTimeout(async () => {
        const model = editorRef.current?.getModel();
        if (!model) return;

        const trimmed = dsl.trim();
        if (!trimmed) {
          monaco.editor.setModelMarkers(model, LINT_OWNER, []);
          return;
        }

        try {
          const result = await validateDsl(trimmed);

          if (result.ok) {
            monaco.editor.setModelMarkers(model, LINT_OWNER, []);
          } else {
            monaco.editor.setModelMarkers(
              model,
              LINT_OWNER,
              result.errors.map((e) => ({
                startLineNumber: e.line,
                startColumn:     e.col,
                endLineNumber:   e.line,
                // Underline to the end of the line
                endColumn:       model.getLineLength(e.line) + 1,
                message:         e.message,
                severity:        monaco.MarkerSeverity.Error,
              })),
            );
          }
        } catch {
          // Backend not reachable — clear stale markers silently
          const model = editorRef.current?.getModel();
          if (model) monaco.editor.setModelMarkers(model, LINT_OWNER, []);
        }
      }, LINT_DELAY);
    },
    [monaco],
  );

  // Lint whenever the value changes externally (e.g., loading a saved pattern)
  useEffect(() => {
    runLint(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // ── Editor mount ─────────────────────────────────────────────────────────────
  const handleMount = (ed: editor.IStandaloneCodeEditor) => {
    editorRef.current = ed;
    ed.updateOptions({ theme: 'wickwatch-dark' });
    // Lint initial value
    runLint(ed.getValue());
  };

  const handleChange = (v: string | undefined) => {
    const dsl = v ?? '';
    onChange(dsl);
    runLint(dsl);
  };

  return (
    // overflow: visible so Monaco's suggest / hover widgets are not clipped
    // when the cursor is near the bottom of the editor.
    <div style={styles.wrapper}>
      <Editor
        height="300px"
        language={LANGUAGE_ID}
        theme="wickwatch-dark"
        value={value}
        onChange={handleChange}
        onMount={handleMount}
        options={{
          minimap:               { enabled: false },
          fontSize:              13,
          fontFamily:            '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
          lineNumbers:           'on',
          scrollBeyondLastLine:  false,
          wordWrap:              'on',
          readOnly:              readOnly ?? false,
          padding:               { top: 12, bottom: 12 },
          suggest:               { showWords: false },
          quickSuggestions:      true,
          automaticLayout:       true,
          tabSize:               2,
          renderLineHighlight:   'line',
          cursorStyle:           'line',
          lineDecorationsWidth:  8,
          glyphMargin:           false,
          // ↓ positions suggest / hover widgets using position:fixed so they
          //   are not clipped by the overflow:hidden on the wrapper
          fixedOverflowWidgets:  true,
        }}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    border:     '1px solid #2a2a3a',
    borderRadius: 8,
    overflow:   'hidden',
    background: '#0f0f18',
  },
};
