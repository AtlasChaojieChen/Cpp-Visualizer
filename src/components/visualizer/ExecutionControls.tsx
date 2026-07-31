import { Play, Pause, SkipForward, SkipBack, RotateCcw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// 1x is the historical 500ms interval; higher multipliers divide it.
const SPEED_OPTIONS = [
  { label: '1x', ms: 500 },
  { label: '2x', ms: 250 },
  { label: '5x', ms: 100 },
  { label: '20x', ms: 25 },
];

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
  speed: number;
  onSpeedChange: (speed: number) => void;
}

export const ExecutionControls = ({
  onRun, onStepForward, onStepBack, onPlay, onPause, onReset,
  isPlaying, canStepForward, canStepBack, hasSteps,
  currentStep, totalSteps, onStepChange, speed, onSpeedChange,
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

      <Button onClick={onStepBack} size="icon" variant="ghost" disabled={!canStepBack} className="h-8 w-8" aria-label="Step backward" title="Step backward">
        <SkipBack className="w-4 h-4" />
      </Button>

      {isPlaying ? (
        <Button onClick={onPause} size="icon" variant="ghost" className="h-8 w-8" aria-label="Pause playback" title="Pause playback">
          <Pause className="w-4 h-4" />
        </Button>
      ) : (
        <Button onClick={onPlay} size="icon" variant="ghost" disabled={!canStepForward} className="h-8 w-8" aria-label="Play execution" title="Play execution">
          <Play className="w-4 h-4" />
        </Button>
      )}

      <Button onClick={onStepForward} size="icon" variant="ghost" disabled={!canStepForward} className="h-8 w-8" aria-label="Step forward" title="Step forward">
        <SkipForward className="w-4 h-4" />
      </Button>

      <Button onClick={onReset} size="icon" variant="ghost" disabled={!hasSteps} className="h-8 w-8" aria-label="Reset execution" title="Reset execution">
        <RotateCcw className="w-4 h-4" />
      </Button>

      <Select value={String(speed)} onValueChange={(v) => onSpeedChange(Number(v))}>
        <SelectTrigger
          aria-label="Playback speed"
          title="Playback speed"
          className="h-8 w-[70px] px-2 text-xs font-mono"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SPEED_OPTIONS.map((o) => (
            <SelectItem key={o.ms} value={String(o.ms)} className="text-xs font-mono">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
