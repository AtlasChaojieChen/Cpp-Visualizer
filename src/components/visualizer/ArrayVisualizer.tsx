import { motion } from 'framer-motion';
import type { VariableInfo, ArrayAccessInfo } from '@/lib/cpp-engine';

interface Props {
  arrays: VariableInfo[];
  prevArrays?: VariableInfo[];
  arrayAccesses?: ArrayAccessInfo[];
  globalArrayNames?: Set<string>;
}

export const ArrayVisualizer = ({ arrays, prevArrays, arrayAccesses = [], globalArrayNames }: Props) => {
  if (arrays.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-viz-blue flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-viz-blue" />
        Arrays
      </h3>
      {arrays.map((arr) => {
        const prevArr = prevArrays?.find(a => a.name === arr.name);
        const values = arr.value as any[];
        const accesses = arrayAccesses.filter(a => a.arrayName === arr.name);

        // Trim trailing default-value (zero/empty) elements for display.
        // Always keep any index that is currently accessed or has a non-default value.
        const maxAccessedIdx = accesses.length > 0 ? Math.max(...accesses.map(a => a.index)) : -1;
        let trimEnd = values.length - 1;
        while (trimEnd > 0 && (values[trimEnd] === 0 || values[trimEnd] === '') && trimEnd > maxAccessedIdx) {
          trimEnd--;
        }
        const visibleValues = values.slice(0, trimEnd + 1);

        return (
          <div key={arr.name} className="space-y-1.5">
            <div className="text-xs font-mono text-muted-foreground">
              {arr.type.replace('[]', '').replace(/vector<(\w+)>/, '$1')} <span className="text-viz-blue">{arr.name}</span>[{values.length}]{globalArrayNames?.has(arr.name) && <span className="text-viz-purple ml-1.5">(global)</span>}
            </div>
            <div className="flex gap-1 flex-wrap">
              {visibleValues.map((val, idx) => {
                const prevVal = prevArr ? (prevArr.value as number[])[idx] : undefined;
                const changed = prevVal !== undefined && prevVal !== val;
                const access = accesses.find(a => a.index === idx);
                const isAccessed = !!access;
                return (
                  <motion.div
                    key={idx}
                    animate={changed ? {
                      scale: [1, 1.15, 1],
                      transition: { duration: 0.3 },
                    } : {}}
                    className="flex flex-col items-center"
                  >
                    <div
                      className={`w-12 h-10 rounded-md border flex items-center justify-center font-mono text-sm font-semibold transition-all duration-200 ${
                        isAccessed
                          ? 'bg-viz-orange/25 border-viz-orange text-foreground ring-1 ring-viz-orange/50 shadow-[0_0_8px_hsla(38,92%,50%,0.3)]'
                          : changed
                          ? 'bg-viz-yellow/20 border-viz-yellow/60 text-foreground'
                          : 'bg-[hsla(217,91%,68%,0.08)] border-[hsla(217,91%,68%,0.25)]'
                      }`}
                    >
                      {val}
                    </div>
                    {isAccessed ? (
                      <span className="text-[10px] text-viz-orange font-bold mt-0.5 font-mono">{access.label}</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">{idx}</span>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
