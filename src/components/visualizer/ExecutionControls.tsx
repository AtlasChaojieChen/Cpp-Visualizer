import { Play, Pause, SkipForward, SkipBack, RotateCcw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface Props {
  onRun: () => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  isPlaying: boolean;
  canStepForward: boolean;
  canStepBack: boolean;
  hasSteps: boolean;
  currentStep: number;
  totalSteps: number;
  onStepChange: (step: number) => void;
}

export const ExecutionControls = ({
  onRun, onStepForward, onStepBack, onPlay, onPause, onReset,
  isPlaying, canStepForward, canStepBack, hasSteps,
  currentStep, totalSteps, onStepChange,
}: Props) => {
  return (
    <div className="flex items-center gap-2 p-3 border-t border-border bg-card shrink-0">
      <Button
        onClick={onRun}
        size="sm"
        className="bg-viz-green hover:bg-viz-green/80 text-background font-semibold"
      >
        <Zap className="w-3.5 h-3.5" />
        Run
      </Button>

      <div className="w-px h-6 bg-border" />

      <Button onClick={onStepBack} size="icon" variant="ghost" disabled={!canStepBack} className="h-8 w-8">
        <SkipBack className="w-4 h-4" />
      </Button>

      {isPlaying ? (
        <Button onClick={onPause} size="icon" variant="ghost" className="h-8 w-8">
          <Pause className="w-4 h-4" />
        </Button>
      ) : (
        <Button onClick={onPlay} size="icon" variant="ghost" disabled={!canStepForward} className="h-8 w-8">
          <Play className="w-4 h-4" />
        </Button>
      )}

      <Button onClick={onStepForward} size="icon" variant="ghost" disabled={!canStepForward} className="h-8 w-8">
        <SkipForward className="w-4 h-4" />
      </Button>

      <Button onClick={onReset} size="icon" variant="ghost" disabled={!hasSteps} className="h-8 w-8">
        <RotateCcw className="w-4 h-4" />
      </Button>

      {hasSteps && (
        <>
          <div className="w-px h-6 bg-border" />
          <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
            {currentStep + 1} / {totalSteps}
          </span>
          <Slider
            value={[currentStep]}
            onValueChange={([v]) => onStepChange(v)}
            min={0}
            max={Math.max(totalSteps - 1, 0)}
            step={1}
            className="flex-1 min-w-[80px]"
          />
        </>
      )}
    </div>
  );
};
