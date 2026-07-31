import { BookOpen } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EXAMPLES, type ExampleProgram } from '@/lib/example-programs';

// Categories mirror the section comments in example-programs.ts. Names listed
// here are matched against EXAMPLES; anything not listed still shows up under
// "More", so adding an example never makes it disappear from the picker.
const CATEGORIES: { label: string; names: string[] }[] = [
  {
    label: 'Basics',
    names: ['Variables & Arithmetic', 'Input (cin)', 'If/Else & Loops', 'Factorial (Recursion)', 'Fibonacci'],
  },
  { label: 'Sorting', names: ['Bubble Sort', 'Selection Sort', 'Insertion Sort'] },
  { label: 'Searching', names: ['Binary Search', 'Linear Search'] },
  {
    label: 'Data Structures',
    names: ['Vector Operations', 'Stack (Array)', 'Queue (Array)', 'Binary Tree', 'BST Insert'],
  },
  {
    label: 'Classic Algorithms',
    names: ['Two Sum', 'Reverse Array', 'GCD (Euclidean)', 'Power (Recursion)'],
  },
  { label: 'Pointers & Heap', names: ['Pointers & Heap', 'Two Inputs'] },
];

const ByName = new Map(EXAMPLES.map((e) => [e.name, e]));

const Groups: { label: string; items: ExampleProgram[] }[] = (() => {
  const claimed = new Set<string>();
  const groups = CATEGORIES.map((c) => {
    const items: ExampleProgram[] = [];
    for (const name of c.names) {
      const example = ByName.get(name);
      if (!example) continue;
      claimed.add(name);
      items.push(example);
    }
    return { label: c.label, items };
  }).filter((g) => g.items.length > 0);

  const rest = EXAMPLES.filter((e) => !claimed.has(e.name));
  return rest.length > 0 ? [...groups, { label: 'More', items: rest }] : groups;
})();

interface Props {
  /** Name of the loaded example, or null once the user has edited the code. */
  value: string | null;
  onSelect: (example: ExampleProgram) => void;
}

export const ExamplePicker = ({ value, onSelect }: Props) => (
  <Select
    value={value ?? ''}
    onValueChange={(name) => {
      const example = ByName.get(name);
      if (example) onSelect(example);
    }}
  >
    <SelectTrigger
      aria-label="Load an example program"
      title="Load an example program"
      className="h-7 w-[200px] gap-1.5 px-2 text-xs"
    >
      <BookOpen className="w-3.5 h-3.5 shrink-0 opacity-70" />
      <SelectValue placeholder="Load an example…" />
    </SelectTrigger>
    <SelectContent className="max-h-[70vh]">
      {Groups.map((group) => (
        <SelectGroup key={group.label}>
          <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {group.label}
          </SelectLabel>
          {group.items.map((example) => (
            <SelectItem key={example.name} value={example.name} className="text-xs">
              {example.name}
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </SelectContent>
  </Select>
);
