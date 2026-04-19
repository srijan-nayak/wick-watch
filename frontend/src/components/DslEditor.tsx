import { useRef, useEffect } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import type { editor, languages } from 'monaco-editor';
import type { Indicator } from '../api/client';

interface DslEditorProps {
  value: string;
  onChange: (v: string) => void;
  indicators: Indicator[];
  readOnly?: boolean;
}

const LANGUAGE_ID = 'wickwatch-dsl';

const OHLC_FIELDS = ['open', 'high', 'low', 'close', 'volume'];
const BOOL_PROPS = ['is_green', 'is_red', 'is_doji'];
const CANDLE_FIELDS = [...OHLC_FIELDS, ...BOOL_PROPS];
const KEYWORDS = ['AND', 'OR'];
const CANDLE_SUGGESTIONS = ['c1', 'c2', 'c3', 'c4', 'c5'];

function buildTokensProvider(): languages.IMonarchLanguage {
  return {
    defaultToken: 'invalid',
    keywords: KEYWORDS,
    boolProps: BOOL_PROPS,
    ohlcFields: OHLC_FIELDS,

    tokenizer: {
      root: [
        // Comments
        [/#.*$/, 'comment'],
        // Candle references like c1, c2
        [/\bc\d+\b/, 'candle-ref'],
        // Bool properties
        [/\b(is_green|is_red|is_doji)\b/, 'bool-prop'],
        // OHLC fields
        [/\b(open|high|low|close|volume)\b/, 'ohlc-field'],
        // Keywords
        [/\b(AND|OR)\b/, 'keyword'],
        // Numbers
        [/\b\d+(\.\d+)?\b/, 'number'],
        // Comparison operators
        [/[><=!]+/, 'operator'],
        // Dots, commas, parens
        [/[.,()]/, 'delimiter'],
        // Whitespace
        [/\s+/, 'white'],
        // Identifiers (indicator names, etc.)
        [/[a-zA-Z_]\w*/, 'identifier'],
      ],
    },
  };
}

export default function DslEditor({ value, onChange, indicators, readOnly }: DslEditorProps) {
  const monaco = useMonaco();
  const registeredRef = useRef(false);
  const completionDisposableRef = useRef<{ dispose: () => void } | null>(null);

  useEffect(() => {
    if (!monaco) return;
    if (registeredRef.current) return;
    registeredRef.current = true;

    // Register language
    if (!monaco.languages.getLanguages().some((l) => l.id === LANGUAGE_ID)) {
      monaco.languages.register({ id: LANGUAGE_ID });
    }

    // Set tokens
    monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, buildTokensProvider());

    // Define dark theme
    monaco.editor.defineTheme('wickwatch-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '5a5a7a', fontStyle: 'italic' },
        { token: 'candle-ref', foreground: 'a5b4fc' },
        { token: 'bool-prop', foreground: 'f9a8d4' },
        { token: 'ohlc-field', foreground: '6ee7b7' },
        { token: 'keyword', foreground: 'fbbf24', fontStyle: 'bold' },
        { token: 'number', foreground: 'fb923c' },
        { token: 'operator', foreground: 'e879f9' },
        { token: 'delimiter', foreground: '94a3b8' },
        { token: 'identifier', foreground: '93c5fd' },
      ],
      colors: {
        'editor.background': '#0f0f18',
        'editor.foreground': '#c4c4e0',
        'editor.lineHighlightBackground': '#1a1a28',
        'editorLineNumber.foreground': '#3a3a5a',
        'editorCursor.foreground': '#6366f1',
        'editor.selectionBackground': '#3730a350',
      },
    });
  }, [monaco]);

  // Re-register completion provider whenever indicators change
  useEffect(() => {
    if (!monaco) return;

    // Dispose old
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

          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          // After a dot → suggest OHLC fields + bool props
          const dotMatch = textBefore.match(/\b(c\d+)\.\s*$/);
          if (dotMatch) {
            return {
              suggestions: CANDLE_FIELDS.map((f) => ({
                label: f,
                kind: BOOL_PROPS.includes(f)
                  ? monaco.languages.CompletionItemKind.Property
                  : monaco.languages.CompletionItemKind.Field,
                insertText: f,
                detail: BOOL_PROPS.includes(f) ? 'boolean' : 'number',
                documentation: BOOL_PROPS.includes(f)
                  ? `True if the candle ${f.replace('is_', 'is ')}`
                  : `${f.charAt(0).toUpperCase() + f.slice(1)} price`,
                range,
              })),
            };
          }

          // After an indicator name followed by '(' → param hints
          const indicatorCallMatch = textBefore.match(
            new RegExp(`\\b(${indicatorNames.join('|')})\\(\\s*$`),
          );
          if (indicatorCallMatch) {
            const ind = indicators.find((i) => i.name === indicatorCallMatch[1]);
            if (ind) {
              const paramEntries = Object.entries(ind.params);
              return {
                suggestions: paramEntries.map(([param, info]) => ({
                  label: `${param}=`,
                  kind: monaco.languages.CompletionItemKind.Variable,
                  insertText: `${param}=`,
                  detail: `${info.type}${info.default !== null ? ` (default: ${info.default})` : ''}`,
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
                label: c,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: c,
                detail: 'Candle reference',
                documentation: `Reference to candle ${c.slice(1)} (1 = most recent)`,
                range,
              })),
            };
          }

          // Top-level → indicator names + AND + OR + candle refs
          return {
            suggestions: [
              ...CANDLE_SUGGESTIONS.map((c) => ({
                label: c,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: c,
                detail: 'Candle reference',
                range,
              })),
              ...KEYWORDS.map((kw) => ({
                label: kw,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: kw,
                detail: 'Logical operator',
                range,
              })),
              ...indicators.map((ind) => ({
                label: ind.name,
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: `${ind.name}(`,
                detail: ind.label,
                documentation: ind.description,
                range,
              })),
            ],
          };
        },
      },
    );

    return () => {
      completionDisposableRef.current?.dispose();
    };
  }, [monaco, indicators]);

  const handleMount = (ed: editor.IStandaloneCodeEditor) => {
    ed.updateOptions({ theme: 'wickwatch-dark' });
  };

  return (
    <div style={styles.wrapper}>
      <Editor
        height="300px"
        language={LANGUAGE_ID}
        theme="wickwatch-dark"
        value={value}
        onChange={(v) => onChange(v ?? '')}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          readOnly: readOnly ?? false,
          padding: { top: 12, bottom: 12 },
          suggest: { showWords: false },
          quickSuggestions: true,
          automaticLayout: true,
          tabSize: 2,
          renderLineHighlight: 'line',
          cursorStyle: 'line',
          lineDecorationsWidth: 8,
          glyphMargin: false,
        }}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    border: '1px solid #2a2a3a',
    borderRadius: 8,
    overflow: 'hidden',
    background: '#0f0f18',
  },
};
