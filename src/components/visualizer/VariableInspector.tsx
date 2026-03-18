import { motion, AnimatePresence } from 'framer-motion';
import type { StackFrameInfo, VariableInfo } from '@/lib/cpp-engine';

interface Props {
  callStack: StackFrameInfo[];
  globals?: VariableInfo[];
}

const formatFrameLabel = (frame: StackFrameInfo) => {
  const args = frame.args?.map(a => String(a)).join(', ') ?? '';
  return `${frame.name}(${args})`;
};

const formatValue = (value: any): string => {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const fields = Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', ');
    return `{ ${fields} }`;
  }
  return typeof value === 'string' ? `"${value}"` : String(value);
};

export const VariableInspector = ({ callStack, globals }: Props) => {
  const framesWithVars = callStack
    .map((frame, i) => ({
      frame,
      vars: frame.variables.filter(v => !v.isArray),
      depth: i,
    }))
    .filter(f => f.vars.length > 0);

  const globalScalars = globals?.filter(v => !v.isArray) ?? [];

  if (framesWithVars.length === 0 && globalScalars.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-viz-blue flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-viz-blue" />
        Variables
      </h3>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-secondary/50">
          <div className="p-2">Scope</div>
          <div className="p-2">Name</div>
          <div className="p-2">Type</div>
          <div className="p-2">Value</div>
        </div>
        <AnimatePresence mode="popLayout">
          {framesWithVars.map(({ frame, vars, depth }) =>
            vars.map((v) => (
              <motion.div
                key={`${frame.name}-${depth}-${v.name}-${v.address}`}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-4 text-sm font-mono border-t border-border"
              >
                <div className="p-2 text-viz-green text-xs truncate" title={formatFrameLabel(frame)}>
                  {formatFrameLabel(frame)}
                </div>
                <div className={`p-2 ${v.isPointer ? 'text-viz-orange' : 'text-viz-blue'}`}>
                  {v.isPointer && '* '}{v.name}
                </div>
                <div className="p-2 text-muted-foreground text-xs">{v.type}</div>
                <motion.div
                  key={JSON.stringify(v.value)}
                  initial={v.changed ? { backgroundColor: 'hsla(45, 97%, 56%, 0.25)' } : {}}
                  animate={{ backgroundColor: 'hsla(45, 97%, 56%, 0)' }}
                  transition={{ duration: 0.8 }}
                  className="p-2 font-semibold"
                >
                  {v.isPointer ? (
                    <span className="text-viz-orange">→ 0x{Number(v.value).toString(16)}</span>
                  ) : (
                    formatValue(v.value)
                  )}
                </motion.div>
              </motion.div>
            ))
          )}
          {globalScalars.map((v) => (
            <motion.div
              key={`global-${v.name}-${v.address}`}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-4 text-sm font-mono border-t border-border"
            >
              <div className="p-2 text-viz-purple text-xs truncate">
                GLOBAL
              </div>
              <div className={`p-2 ${v.isPointer ? 'text-viz-orange' : 'text-viz-blue'}`}>
                {v.isPointer && '* '}{v.name}
              </div>
              <div className="p-2 text-muted-foreground text-xs">{v.type}</div>
              <motion.div
                key={JSON.stringify(v.value)}
                initial={v.changed ? { backgroundColor: 'hsla(45, 97%, 56%, 0.25)' } : {}}
                animate={{ backgroundColor: 'hsla(45, 97%, 56%, 0)' }}
                transition={{ duration: 0.8 }}
                className="p-2 font-semibold"
              >
                {v.isPointer ? (
                  <span className="text-viz-orange">→ 0x{Number(v.value).toString(16)}</span>
                ) : (
                  formatValue(v.value)
                )}
              </motion.div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
