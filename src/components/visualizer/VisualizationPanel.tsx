import { useState, useEffect } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CallStackView } from './CallStackView';
import { VariableInspector } from './VariableInspector';
import { ArrayVisualizer } from './ArrayVisualizer';
import { TreeVisualizer } from './TreeVisualizer';
import { HeapView } from './HeapView';
import type { ExecutionStep } from '@/lib/cpp-engine';
import { Code2 } from 'lucide-react';

interface Props {
  currentStep: ExecutionStep | null;
  prevStep: ExecutionStep | null;
  sourceLines: string[];
}

export const VisualizationPanel = ({ currentStep, prevStep, sourceLines }: Props) => {
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number | null>(null);

  useEffect(() => {
    if (currentStep && currentStep.callStack.length > 0) {
      setSelectedFrameIndex(currentStep.callStack.length - 1);
    } else {
      setSelectedFrameIndex(null);
    }
  }, [currentStep]);

  if (!currentStep) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3 text-muted-foreground/50">
          <Code2 className="w-12 h-12 mx-auto" />
          <div>
            <p className="text-sm font-medium">No execution yet</p>
            <p className="text-xs mt-1">Click <span className="text-viz-green font-semibold">Run</span> to start visualizing</p>
          </div>
        </div>
      </div>
    );
  }

  const selectedFrame = selectedFrameIndex !== null ? currentStep.callStack[selectedFrameIndex] : null;
  const selectedCallStack = selectedFrame ? [selectedFrame] : currentStep.callStack;
  const allVars = selectedCallStack.flatMap(f => f.variables);
  const arrays = allVars.filter(v => v.isArray);

  const prevSelectedFrame = selectedFrameIndex !== null && prevStep ? prevStep.callStack[selectedFrameIndex] : null;
  const prevCallStack = prevSelectedFrame ? [prevSelectedFrame] : prevStep?.callStack;
  const prevArrays = prevCallStack?.flatMap(f => f.variables).filter(v => v.isArray);

  // Collect pointer variables for tree visualization
  const pointerVars = allVars
    .filter(v => v.isPointer && typeof v.value === 'number' && v.value > 0)
    .map(v => ({ name: v.name, address: v.value }));

  // Check if heap has tree-like structures
  const hasTreeNodes = currentStep.heap.some(h =>
    !h.freed && typeof h.value === 'object' && h.value !== null &&
    'left' in h.value && 'right' in h.value
  );

  // Non-tree heap entries (simple values)
  const simpleHeap = currentStep.heap.filter(h => {
    if (h.freed) return true;
    if (typeof h.value === 'object' && h.value !== null && 'left' in h.value && 'right' in h.value) return false;
    return true;
  });

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      <ResizablePanel defaultSize={40} minSize={15}>
        <ScrollArea className="h-full">
          <div className="p-4">
            <CallStackView
              callStack={currentStep.callStack}
              sourceLines={sourceLines}
              selectedFrameIndex={selectedFrameIndex}
              onSelectFrame={setSelectedFrameIndex}
              nextLine={currentStep.nextLine}
            />
          </div>
        </ScrollArea>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={60} minSize={15}>
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            <VariableInspector callStack={selectedCallStack} />
            {arrays.length > 0 && (
              <ArrayVisualizer arrays={arrays} prevArrays={prevArrays} arrayAccesses={currentStep.arrayAccesses} />
            )}
            {hasTreeNodes && (
              <TreeVisualizer heap={currentStep.heap} pointerVars={pointerVars} />
            )}
            {simpleHeap.length > 0 && (
              <HeapView heap={simpleHeap} />
            )}
          </div>
        </ScrollArea>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};
