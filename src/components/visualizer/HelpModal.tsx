import { useState } from 'react';
import { HelpCircle, CheckCircle2, XCircle, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const SUPPORTED = [
  'Step-by-step execution with line highlighting',
  'Call stack visualization',
  'Variable inspection (scalars, pointers, structs)',
  'Global variables and global arrays',
  'Recursion',
  '1D arrays (local and global)',
  'Pointers and heap memory (new / delete)',
  'Struct field input and display',
  'cin input for plain variables, array elements, struct fields, and dereferenced pointers',
];

const LIMITATIONS = [
  '2D arrays not yet supported',
  'Brace initialization (Node a{1, nullptr};) not yet supported',
  'Advanced C++ / STL features (maps, sets, templates, …) are out of scope',
  'Some complex global initializer expressions may fall back to 0',
];

const TIPS = [
  'Use small, focused examples for the clearest visualization',
  'Prefer straightforward C++ syntax when exploring features',
  'If execution fails, the syntax may be unsupported rather than a bug in your code',
];

const SEEN_KEY = 'cpp-viz-help-seen';

export const HelpModal = () => {
  const [open, setOpen] = useState(() => localStorage.getItem(SEEN_KEY) !== '1');

  const handleOpenChange = (next: boolean) => {
    if (!next) localStorage.setItem(SEEN_KEY, '1');
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          aria-label="Help"
        >
          <HelpCircle className="w-4 h-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            C++ Visualizer — What's supported?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1 text-sm">
          {/* Supported */}
          <section>
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-viz-green mb-2">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Supported Features
            </h3>
            <ul className="space-y-1.5">
              {SUPPORTED.map((item) => (
                <li key={item} className="flex items-start gap-2 text-foreground/80">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-viz-green shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <div className="border-t border-border" />

          {/* Limitations */}
          <section>
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-viz-red mb-2">
              <XCircle className="w-3.5 h-3.5" />
              Current Limitations
            </h3>
            <ul className="space-y-1.5">
              {LIMITATIONS.map((item) => (
                <li key={item} className="flex items-start gap-2 text-foreground/80">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-viz-red shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <div className="border-t border-border" />

          {/* Tips */}
          <section>
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-viz-yellow mb-2">
              <Lightbulb className="w-3.5 h-3.5" />
              Tips
            </h3>
            <ul className="space-y-1.5">
              {TIPS.map((item) => (
                <li key={item} className="flex items-start gap-2 text-foreground/80">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-viz-yellow shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
