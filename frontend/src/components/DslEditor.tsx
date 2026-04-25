import { useRef, useEffect, useCallback } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import type { editor, languages } from 'monaco-editor';
import type { Indicator } from '../api/client';
import { validateDsl } from '../api/client';
import { useStore } from '../store';

interface DslEditorProps {
  value: string;
  onChange: (v: string) => void;
  indicators: Indicator[];
  readOnly?: boolean;
}

const LANGUAGE_ID = 'wickwatch-dsl';
const LINT_OWNER  = 'dsl-lint';
const LINT_DELAY  = 600;

const OHLC_FIELDS       = ['open', 'high', 'low', 'close', 'volume'];
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
  const theme  = useStore((s) => s.theme);

  const registeredRef           = useRef(false);
  const completionDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const editorRef               = useRef<editor.IStandaloneCodeEditor | null>(null);
  const lintTimerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Language + theme registration (once) ─────────────────────────────────────
  useEffect(() => {
    if (!monaco || registeredRef.current) return;
    registeredRef.current = true;

    if (!monaco.languages.getLanguages().some((l) => l.id === LANGUAGE_ID)) {
      monaco.languages.register({ id: LANGUAGE_ID });
    }

    monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, buildTokensProvider());

    // Dark theme
    monaco.editor.defineTheme('wickwatch-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment',    foreground: '5a5a7a', fontStyle: 'italic' },
        { token: 'candle-ref', foreground: 'a5b4fc' },
        { token: 'bool-prop',  foreground: 'f9a8d4' },
        { token: 'ohlc-field', foreground: '6ee7b7' },
        { token: 'keyword',    foreground: 'fbbf24', fontStyle: 'bold'   },
        { token: 'number',     foreground: 'fb923c' },
        { token: 'operator',   foreground: 'e879f9' },
        { token: 'delimiter',  foreground: '94a3b8' },
        { token: 'identifier', foreground: '93c5fd' },
      ],
      colors: {
        'editor.background':              '#0f0f18',
        'editor.foreground':              '#c4c4e0',
        'editor.lineHighlightBackground': '#1a1a28',
        'editorLineNumber.foreground':    '#3a3a5a',
        'editorCursor.foreground':        '#6366f1',
        'editor.selectionBackground':     '#3730a350',
      },
    });

    // Light theme
    monaco.editor.defineTheme('wickwatch-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment',    foreground: '6b7280', fontStyle: 'italic' },
        { token: 'candle-ref', foreground: '4f46e5' },
        { token: 'bool-prop',  foreground: '9d174d' },
        { token: 'ohlc-field', foreground: '065f46' },
        { token: 'keyword',    foreground: '92400e', fontStyle: 'bold'   },
        { token: 'number',     foreground: '9a3412' },
        { token: 'operator',   foreground: '6d28d9' },
        { token: 'delimiter',  foreground: '475569' },
        { token: 'identifier', foreground: '1e40af' },
      ],
      colors: {
        'editor.background':              '#f8f8fd',
        'editor.foreground':              '#1a1a2e',
        'editor.lineHighlightBackground': '#ededf8',
        'editorLineNumber.foreground':    '#a0a0c0',
        'editorCursor.foreground':        '#6366f1',
        'editor.selectionBackground':     '#6366f120',
      },
    });
  }, [monaco]);

  // ── Switch Monaco theme when user toggles ──────────────────────────────────
  useEffect(() => {
    if (!monaco) return;
    monaco.editor.setTheme(theme === 'light' ? 'wickwatch-light' : 'wickwatch-dark');
  }, [monaco, theme]);

  // ── Completion provider (refreshed when indicators change) ─────────────────
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

          const indMatch = textBefore.match(
            new RegExp(`\\b(${indicatorNames.join('|')})\\([^)]*$`),
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

  // ── Linting ────────────────────────────────────────────────────────────────
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
                endColumn:       model.getLineLength(e.line) + 1,
                message:         e.message,
                severity:        monaco.MarkerSeverity.Error,
              })),
            );
          }
        } catch {
          const model = editorRef.current?.getModel();
          if (model) monaco.editor.setModelMarkers(model, LINT_OWNER, []);
        }
      }, LINT_DELAY);
    },
    [monaco],
  );

  useEffect(() => {
    runLint(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // ── Editor mount ──────────────────────────────────────────────────────────
  const handleMount = (ed: editor.IStandaloneCodeEditor) => {
    editorRef.current = ed;
    ed.updateOptions({ theme: theme === 'light' ? 'wickwatch-light' : 'wickwatch-dark' });
    runLint(ed.getValue());
  };

  const handleChange = (v: string | undefined) => {
    const dsl = v ?? '';
    onChange(dsl);
    runLint(dsl);
  };

  return (
    <div style={styles.wrapper}>
      <Editor
        height="100%"
        language={LANGUAGE_ID}
        theme={theme === 'light' ? 'wickwatch-light' : 'wickwatch-dark'}
        value={value}
        onChange={handleChange}
        onMount={handleMount}
        options={{
          minimap:              { enabled: false },
          fontSize:             13,
          fontFamily:           '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
          lineNumbers:          'on',
          scrollBeyondLastLine: false,
          wordWrap:             'on',
          readOnly:             readOnly ?? false,
          padding:              { top: 12, bottom: 12 },
          suggest:              { showWords: false },
          quickSuggestions:     true,
          automaticLayout:      true,
          tabSize:              2,
          renderLineHighlight:  'line',
          cursorStyle:          'line',
          lineDecorationsWidth: 8,
          glyphMargin:          false,
          fixedOverflowWidgets: true,
        }}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    border:       '1px solid var(--border)',
    borderRadius: 8,
    overflow:     'hidden',
    background:   'var(--bg-editor)',
    // Fills the remaining viewport on tall screens; minHeight is the CSS floor
    // (minHeight overrides height in CSS, so short viewports get 220px and scroll normally)
    height:    'calc(100vh - 420px)',
    minHeight: 220,
  },
};
