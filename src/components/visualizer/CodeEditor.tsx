import Editor, { OnMount } from '@monaco-editor/react';
import { useRef, useEffect } from 'react';
import { useTheme } from 'next-themes';

interface Props {
  code: string;
  onChange: (code: string) => void;
  currentLine: number;
  nextLine?: number;
  error?: string | null;
  parentCallInfo?: { line: number; startCol: number; endCol: number } | null;
}

export const CodeEditor = ({ code, onChange, currentLine, nextLine, error, parentCallInfo }: Props) => {
  const editorRef = useRef<any>(null);
  const decorationsRef = useRef<any[]>([]);
  const { theme } = useTheme();

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  useEffect(() => {
    if (!editorRef.current) return;
    const decorations: any[] = [];
    if (currentLine > 0) {
      decorations.push({
        range: {
          startLineNumber: currentLine,
          startColumn: 1,
          endLineNumber: currentLine,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'current-line-highlight',
          glyphMarginClassName: 'current-line-glyph',
        },
      });
    }
    if (nextLine && nextLine > 0 && nextLine !== currentLine) {
      decorations.push({
        range: {
          startLineNumber: nextLine,
          startColumn: 1,
          endLineNumber: nextLine,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'next-line-highlight',
          glyphMarginClassName: 'next-line-glyph',
        },
      });
    }
    // Highlight parent frame's active call site (whole line + inline call highlight)
    if (parentCallInfo) {
      decorations.push({
        range: {
          startLineNumber: parentCallInfo.line,
          startColumn: 1,
          endLineNumber: parentCallInfo.line,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'parent-call-line-highlight',
          glyphMarginClassName: 'parent-call-line-glyph',
        },
      });
      decorations.push({
        range: {
          startLineNumber: parentCallInfo.line,
          startColumn: parentCallInfo.startCol,
          endLineNumber: parentCallInfo.line,
          endColumn: parentCallInfo.endCol,
        },
        options: {
          inlineClassName: 'parent-call-inline-highlight',
        },
      });
    }
    decorationsRef.current = editorRef.current.deltaDecorations(
      decorationsRef.current,
      decorations
    );
  }, [currentLine, nextLine, parentCallInfo]);

  return (
    <div className="h-full relative">
      <Editor
        height="100%"
        language="cpp"
        theme={theme === 'dark' ? 'vs-dark' : 'light'}
        value={code}
        onChange={(v) => onChange(v || '')}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 12 },
          glyphMargin: true,
          folding: false,
          renderLineHighlight: 'none',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
        }}
      />
      {error && (
        <div className="absolute bottom-0 left-0 right-0 bg-viz-red/90 text-foreground p-3 text-sm font-mono backdrop-blur-sm border-t border-viz-red">
          ⚠ {error}
        </div>
      )}
    </div>
  );
};