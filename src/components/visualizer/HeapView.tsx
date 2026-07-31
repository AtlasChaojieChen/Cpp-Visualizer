import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { HeapBlockInfo } from '@/lib/cpp-engine';

interface Props {
  heap: HeapBlockInfo[];
}

const hex = (n: number) => `0x${n.toString(16)}`;

const blockDomId = (address: number) => `heap-block-${address}`;

const isStructValue = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

// Always return a string: React silently drops boolean children, so `false` would
// otherwise render as an empty cell.
const formatScalar = (v: unknown): string => (typeof v === 'string' ? `"${v}"` : String(v));

export const HeapView = ({ heap }: Props) => {
  // Address of the block currently being pointed at by a hovered/focused link.
  const [linkedAddr, setLinkedAddr] = useState<number | null>(null);

  // Every address the engine currently has a block for (freed blocks included, so a
  // dangling `next` still resolves and can be flagged).
  const blocksByAddress = useMemo(() => {
    const m = new Map<number, HeapBlockInfo>();
    for (const b of heap) m.set(b.address, b);
    return m;
  }, [heap]);

  // A struct field is treated as a pointer member if ANY block of the same struct type
  // holds a live heap address in that field. Pointer-ness is a property of the member,
  // not of one value, so inferring it type-wide lets a sibling `next == 0` render as
  // `nullptr` instead of the integer 0.
  const pointerFieldsByType = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const b of heap) {
      if (!isStructValue(b.value)) continue;
      for (const [key, val] of Object.entries(b.value)) {
        if (typeof val !== 'number' || !blocksByAddress.has(val)) continue;
        if (!m.has(b.type)) m.set(b.type, new Set());
        m.get(b.type)!.add(key);
      }
    }
    return m;
  }, [heap, blocksByAddress]);

  if (heap.length === 0) return null;

  const focusTarget = (address: number) => {
    document
      .getElementById(blockDomId(address))
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const renderFieldValue = (blockType: string, key: string, value: unknown) => {
    const target = typeof value === 'number' ? blocksByAddress.get(value) : undefined;

    if (target) {
      return (
        <button
          type="button"
          onClick={() => focusTarget(target.address)}
          onMouseEnter={() => setLinkedAddr(target.address)}
          onMouseLeave={() => setLinkedAddr(null)}
          onFocus={() => setLinkedAddr(target.address)}
          onBlur={() => setLinkedAddr(null)}
          title={
            target.freed
              ? `Dangling: points at freed ${target.type} block ${hex(target.address)}`
              : `Points at ${target.type} block ${hex(target.address)}`
          }
          className={`rounded px-1 -mx-1 font-semibold underline decoration-dotted underline-offset-2 transition-colors hover:bg-viz-orange/15 focus:outline-none focus-visible:ring-1 focus-visible:ring-viz-orange ${
            target.freed ? 'text-viz-red' : 'text-viz-orange'
          }`}
        >
          → {hex(target.address)}
        </button>
      );
    }

    if (value === 0 && pointerFieldsByType.get(blockType)?.has(key)) {
      return <span className="text-viz-orange/60">nullptr</span>;
    }

    return <span className="text-foreground/90">{formatScalar(value)}</span>;
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-viz-purple flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-viz-purple" />
        Heap Memory
      </h3>
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {heap.map((block) => {
            const struct = !block.freed && isStructValue(block.value) ? block.value : null;
            const isLinkTarget = linkedAddr === block.address;

            return (
              <motion.div
                key={block.address}
                id={blockDomId(block.address)}
                layout
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: block.freed ? 0.4 : 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className={`rounded-lg border p-3 font-mono text-sm ${
                  block.freed
                    ? 'border-viz-red/30 bg-viz-red/[0.05]'
                    : 'border-viz-purple/30 bg-viz-purple/[0.06]'
                } ${isLinkTarget ? 'ring-2 ring-viz-orange' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs ${isLinkTarget ? 'text-viz-orange font-semibold' : 'text-muted-foreground'}`}
                  >
                    {isLinkTarget && '→ '}
                    {hex(block.address)}
                  </span>
                  {block.freed ? (
                    <span className="text-viz-red text-xs font-semibold tracking-wider">FREED</span>
                  ) : struct ? null : (
                    <span className="text-viz-purple font-semibold">{formatScalar(block.value)}</span>
                  )}
                </div>

                {struct && (
                  <div className="mt-1.5 space-y-0.5">
                    {Object.entries(struct).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-baseline justify-between gap-3 text-xs leading-tight"
                      >
                        <span className="text-muted-foreground">{key}</span>
                        {renderFieldValue(block.type, key, value)}
                      </div>
                    ))}
                  </div>
                )}

                <div className="text-xs text-muted-foreground/60 mt-1">{block.type}</div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
