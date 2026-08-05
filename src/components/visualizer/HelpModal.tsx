import { useState } from 'react';
import { HelpCircle, CheckCircle2, XCircle, Lightbulb, Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { REPO_URL } from '@/lib/repo';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const SUPPORTED = [
  'Step-by-step execution with line highlighting — forwards and backwards',
  'Call stack with arguments and return values',
  'Variable inspection (scalars, pointers, references, structs)',
  'Globals, global arrays, and 1D local arrays',
  'Recursion',
  'Pointers and heap memory (new / delete), including use-after-free detection',
  'Reference parameters that alias the caller’s storage',
  'string: indexing that reads and writes, plus size / length / empty / front / back / clear / erase',
  'vector<T>: push_back / pop_back, indexing, and the same size / empty / front / back / clear / erase set',
  'Bitwise operators & | ^ ~ << >> with their compound forms, and hex (0xff) / binary (0b1010) literals',
  'cin / cout / endl, including cin into array elements, struct fields, and dereferenced pointers',
];

const LIMITATIONS = [
  '2D arrays and array parameters (int a[]) are not supported',
  'Brace initialization of a stack variable (Node a{1, nullptr};) is not supported — but new Node{1, nullptr} on the heap does work',
  'Structs are data only: no methods, templates, inheritance, or operator overloading',
  'No STL beyond string and vector — no map, set, sort, or <algorithm>',
  'No range-based for, auto, switch, do-while, or the ternary ?: operator',
  'An iterator is just an integer offset, so a.begin() + i works but *it and it++ do not',
  'substr / find / insert / push_back on a string are not implemented',
  'A global initialized from a function call falls back to 0',
  'Execution stops after 10,000 steps, which caps recursion demos at roughly fib(16)',
  'bool does not decay to 0/1 — cout << (a == b) prints true, not 1',
];

const TIPS = [
  'Everything runs in your browser — there is no compiler and no server',
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

          <div className="border-t border-border" />

          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="w-3.5 h-3.5 shrink-0" />
            Source, issues and the full supported-subset notes on GitHub
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
};
