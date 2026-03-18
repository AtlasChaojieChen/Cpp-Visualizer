import { motion } from 'framer-motion';
import { Terminal } from 'lucide-react';

interface Props {
  output: string;
}

export const OutputPanel = ({ output }: Props) => {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        <Terminal className="w-3 h-3" />
        Output
      </h3>
      <motion.div
        key={output.length}
        initial={{ opacity: 0.8 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="rounded-lg border border-border bg-background/80 p-3 font-mono text-sm min-h-[48px] whitespace-pre-wrap"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {output || (
          <span className="text-muted-foreground/40 italic text-xs">No output yet</span>
        )}
      </motion.div>
    </div>
  );
};
