import type { StackFrameInfo } from '@/lib/cpp-engine';
import { formatFrameLabel, formatReturnValue } from '@/lib/format';

interface Props {
  callStack: StackFrameInfo[];
  sourceLines: string[];
  selectedFrameIndex: number | null;
  onSelectFrame: (index: number) => void;
  nextLine?: number;
}

const formatValue = (value: any): string => {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const fields = Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', ');
    return `{ ${fields} }`;
  }
  return String(value);
};

export const CallStackView = ({ callStack, sourceLines, selectedFrameIndex, onSelectFrame, nextLine }: Props) => {
  if (callStack.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-viz-green flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-viz-green" />
        Call Stack
        <span className="text-muted-foreground font-normal normal-case">— click a frame to inspect</span>
      </h3>
      <div className="space-y-2">
        {[...callStack].reverse().map((frame, i) => {
          const originalIndex = callStack.length - 1 - i;
          const isSelected = selectedFrameIndex === originalIndex;
          const isTop = i === 0;
          const lines = sourceLines.slice(frame.startLine - 1, frame.endLine);
          return (
            <div
              key={`${frame.name}-${originalIndex}`}
              onClick={() => onSelectFrame(originalIndex)}
              className={`rounded-lg border overflow-hidden transition-colors cursor-pointer ${
                isSelected
                  ? 'border-viz-green/60 bg-viz-green/[0.08] ring-1 ring-viz-green/30'
                  : isTop
                  ? 'border-viz-green/20 bg-viz-green/[0.04] hover:border-viz-green/40'
                  : 'border-border bg-card/50 hover:border-muted-foreground/30'
              }`}
            >
              <div className="px-3 py-2 font-mono text-sm font-semibold text-viz-green border-b border-border/50 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-viz-green animate-pulse" />}
                  {formatFrameLabel(frame)}
                  {/* Present only on the step where this frame executes its
                      return — the moment a recursion's value starts climbing
                      back up the stack. */}
                  {'returnValue' in frame && (
                    <span className="flex items-center gap-1 rounded bg-viz-orange/15 px-1.5 py-0.5 text-[10px] font-normal text-viz-orange ring-1 ring-viz-orange/30">
                      <span aria-hidden="true">↩</span>
                      <span className="sr-only">returns </span>
                      {formatReturnValue(frame.returnValue, frame.returnType)}
                    </span>
                  )}
                </span>
                {frame.variables.length > 0 && (
                  <span className="text-[10px] text-muted-foreground font-normal">
                    {frame.variables.filter(v => !v.isArray).map(v => (
                      <span key={v.name} className="ml-2">
                        <span className="text-muted-foreground/60">{v.name}</span>
                        <span className="text-viz-yellow">=</span>
                        <span className={v.changed ? 'text-viz-yellow' : 'text-foreground/80'}>
                          {formatValue(v.value)}
                        </span>
                      </span>
                    ))}
                  </span>
                )}
              </div>
              {/* Mini code view */}
              <div className="text-xs font-mono leading-5 overflow-x-auto">
                {lines.map((lineText, li) => {
                  const lineNum = frame.startLine + li;
                  const isActive = lineNum === frame.activeLine;
                  const isNext = isTop && lineNum === nextLine && !isActive;
                  const callCols = frame.activeCallColumns;
                  const hasCallHighlight = isActive && callCols && !isTop;
                  return (
                    <div
                      key={lineNum}
                      className={`flex transition-colors ${
                        isActive
                          ? isTop
                            ? 'bg-viz-green/20 text-foreground'
                            : 'bg-viz-orange/10 text-foreground'
                          : isNext
                          ? 'bg-viz-blue/10 text-muted-foreground/80'
                          : 'text-muted-foreground/60'
                      }`}
                    >
                      <span className={`w-8 shrink-0 text-right pr-2 select-none ${
                        isActive
                          ? isTop ? 'text-viz-green font-bold' : 'text-viz-orange font-bold'
                          : isNext ? 'text-viz-blue/60' : 'text-muted-foreground/30'
                      }`}>
                        {lineNum}
                      </span>
                      <span className="pr-3 whitespace-pre">
                        {hasCallHighlight ? (
                          <>
                            {lineText.substring(0, callCols.startCol - 1)}
                            <span className="bg-viz-orange/30 border-b-2 border-viz-orange rounded-sm px-0.5">
                              {lineText.substring(callCols.startCol - 1, callCols.endCol - 1)}
                            </span>
                            {lineText.substring(callCols.endCol - 1)}
                          </>
                        ) : lineText}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};