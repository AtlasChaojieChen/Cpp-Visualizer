import { motion, AnimatePresence } from 'framer-motion';
import type { HeapBlockInfo } from '@/lib/cpp-engine';

interface Props {
  heap: HeapBlockInfo[];
}

export const HeapView = ({ heap }: Props) => {
  if (heap.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-viz-purple flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-viz-purple" />
        Heap Memory
      </h3>
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {heap.map((block) => (
            <motion.div
              key={block.address}
              layout
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: block.freed ? 0.4 : 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`rounded-lg border p-3 font-mono text-sm ${
                block.freed
                  ? 'border-viz-red/30 bg-viz-red/[0.05]'
                  : 'border-viz-purple/30 bg-viz-purple/[0.06]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">
                  0x{block.address.toString(16)}
                </span>
                {block.freed ? (
                  <span className="text-viz-red text-xs font-semibold tracking-wider">FREED</span>
                ) : (
                  <span className="text-viz-purple font-semibold">{String(block.value)}</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground/60 mt-1">{block.type}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
