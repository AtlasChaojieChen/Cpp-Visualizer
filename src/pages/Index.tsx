import { useState, useEffect, useCallback } from 'react';
import logo from '@/assets/logo.png';

import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

import { CodeEditor } from '@/components/visualizer/CodeEditor';
import { ExecutionControls } from '@/components/visualizer/ExecutionControls';
import { VisualizationPanel } from '@/components/visualizer/VisualizationPanel';

import { executeCode, type ExecutionStep } from '@/lib/cpp-engine';
import { ThemeToggle } from '@/components/ThemeToggle';
import { HelpModal } from '@/components/visualizer/HelpModal';


const Index = () => {
  const [code, setCode] = useState(`#include <iostream>
using namespace std;

int factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    int result = n * factorial(n - 1);
    return result;
}

int main() {
    int num = 5;
    int result = factorial(num);
    cout << num << "! = " << result << endl;
    return 0;
}`);
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [stepIndex, setStepIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed] = useState(500);
  const [error, setError] = useState<string | null>(null);
  const [stdin, setStdin] = useState('');
  const [stdinOpen, setStdinOpen] = useState(false);

  const currentStep = stepIndex >= 0 && stepIndex < steps.length ? steps[stepIndex] : null;
  const prevStep = stepIndex > 0 ? steps[stepIndex - 1] : null;

  const runCode = useCallback(() => {
    const result = executeCode(code, stdin);
    setSteps(result.steps);
    setStepIndex(result.steps.length > 0 ? 0 : -1);
    setError(result.error || null);
    setIsPlaying(false);
  }, [code, stdin]);

  const stepForward = () => setStepIndex(prev => Math.min(prev + 1, steps.length - 1));
  const stepBack = () => setStepIndex(prev => Math.max(prev - 1, 0));
  const reset = () => { setSteps([]); setStepIndex(-1); setIsPlaying(false); setError(null); };

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setStepIndex(prev => {
        if (prev >= steps.length - 1) { setIsPlaying(false); return prev; }
        return prev + 1;
      });
    }, speed);
    return () => clearInterval(timer);
  }, [isPlaying, speed, steps.length]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="h-11 border-b border-border flex items-center justify-between px-4 bg-card shrink-0 relative">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="C++ Visualizer" className="w-7 h-7 rounded-md" />
          <h1 className="text-sm font-bold tracking-tight">
            C++ <span className="text-primary">Visualizer</span>
          </h1>
        </div>
        {/* Center: reopen help modal */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <HelpModal />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Step-by-step execution visualizer</span>
          <ThemeToggle />
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="vertical">
          {/* Top: Code + STDIN/Output */}
          <ResizablePanel defaultSize={55} minSize={20}>
            <ResizablePanelGroup direction="horizontal" className="h-full">
              {/* Code Editor */}
              <ResizablePanel defaultSize={60} minSize={25}>
                <div className="flex flex-col h-full">
                  <div className="flex-1 min-h-0">
                    <CodeEditor
                      code={code}
                      onChange={(c) => { setCode(c); reset(); }}
                      currentLine={currentStep?.line ?? 0}
                      nextLine={currentStep?.nextLine}
                      error={error}
                      parentCallInfo={
                        currentStep && currentStep.callStack.length >= 2
                          ? (() => {
                              const parentFrame = currentStep.callStack[currentStep.callStack.length - 2];
                              if (parentFrame.activeCallColumns) {
                                return {
                                  line: parentFrame.activeLine,
                                  startCol: parentFrame.activeCallColumns.startCol,
                                  endCol: parentFrame.activeCallColumns.endCol,
                                };
                              }
                              return null;
                            })()
                          : null
                      }
                    />
                  </div>
                  <ExecutionControls
                    onRun={runCode}
                    onStepForward={stepForward}
                    onStepBack={stepBack}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onReset={reset}
                    isPlaying={isPlaying}
                    canStepForward={stepIndex < steps.length - 1}
                    canStepBack={stepIndex > 0}
                    hasSteps={steps.length > 0}
                    currentStep={stepIndex}
                    totalSteps={steps.length}
                    onStepChange={(s) => { setStepIndex(s); setIsPlaying(false); }}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              {/* STDIN + Output */}
              <ResizablePanel defaultSize={40} minSize={15}>
                <ResizablePanelGroup direction="vertical" className="h-full">
                  <ResizablePanel defaultSize={40} minSize={15}>
                    <div className="flex flex-col h-full">
                      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border bg-card shrink-0">
                        STDIN
                      </div>
                      <textarea
                        value={stdin}
                        onChange={(e) => setStdin(e.target.value)}
                        placeholder="Enter input..."
                        className="flex-1 w-full bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground resize-none focus:outline-none"
                      />
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={60} minSize={15}>
                    <div className="flex flex-col h-full">
                      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border bg-card shrink-0">
                        OUTPUT
                      </div>
                      <pre className="flex-1 w-full bg-background px-3 py-2 text-sm font-mono text-foreground overflow-auto whitespace-pre-wrap">
                        {currentStep?.output || <span className="text-muted-foreground/40 italic text-xs">No output yet</span>}
                      </pre>
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle withHandle />
          {/* Bottom: Visualizer */}
          <ResizablePanel defaultSize={45} minSize={15}>
            <VisualizationPanel currentStep={currentStep} prevStep={prevStep} sourceLines={code.split('\n')} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default Index;
