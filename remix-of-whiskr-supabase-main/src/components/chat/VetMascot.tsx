import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Brain, Sparkles, FileSearch, Zap, Microscope, BookOpen, Stethoscope, ClipboardCheck } from 'lucide-react';

interface VetMascotThinkingProps {
  onComplete?: () => void;
  mode?: 'chat' | 'file-analysis';
  isComplete?: boolean;
}

const chatStages = [
  { text: 'Analyzing your case...', icon: Brain, duration: 0 },
  { text: 'Processing clinical data...', icon: FileSearch, duration: 8000 },
  { text: 'Generating recommendations...', icon: Sparkles, duration: 18000 },
  { text: 'Finalizing response...', icon: Zap, duration: 28000 },
];

const fileAnalysisStages = [
  { text: 'Opening the file...', icon: FileSearch, duration: 0 },
  { text: 'Reading through the details...', icon: BookOpen, duration: 8000 },
  { text: 'Cross-referencing with medical knowledge...', icon: Brain, duration: 18000 },
  { text: 'Examining results carefully...', icon: Microscope, duration: 28000 },
  { text: 'Looking through my notes...', icon: ClipboardCheck, duration: 38000 },
  { text: 'Correlating with clinical patterns...', icon: Stethoscope, duration: 48000 },
  { text: 'Finalizing analysis...', icon: Sparkles, duration: 56000 },
];

export function VetMascotThinking({ onComplete, mode = 'chat', isComplete = false }: VetMascotThinkingProps) {
  const [progress, setProgress] = React.useState(0);
  const [stageIndex, setStageIndex] = React.useState(0);
  
  const thinkingStages = mode === 'file-analysis' ? fileAnalysisStages : chatStages;
  const targetTime = mode === 'file-analysis' ? 57000 : 35000; // 57 seconds for files, 35 for chat

  React.useEffect(() => {
    const startTime = Date.now();
    
    const interval = setInterval(() => {
      setProgress((prev) => {
        const elapsed = Date.now() - startTime;
        
        // Logarithmic curve: fast at start, slower as time goes on
        // This makes long waits feel more natural
        const rawProgress = (Math.log(elapsed + 1000) / Math.log(targetTime + 1000)) * 100;
        
        // Cap at 95% to leave room for completion when response arrives
        const targetProgress = Math.min(rawProgress, 95);
        
        // Smooth interpolation
        const diff = targetProgress - prev;
        const increment = diff * 0.1; // Slower interpolation for smoother feel
        
        return Math.min(prev + increment, 95);
      });
    }, 150); // Slightly slower update interval for smoother animation

    return () => clearInterval(interval);
  }, [targetTime]);

  React.useEffect(() => {
    // Cycle through thinking stages
    const timers = thinkingStages.map((stage, index) => {
      return setTimeout(() => {
        setStageIndex(index);
      }, stage.duration);
    });

    return () => timers.forEach(timer => clearTimeout(timer));
  }, []);

  React.useEffect(() => {
    if (isComplete) {
      // Animate to 100% when response is ready
      const completeInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(completeInterval);
            return 100;
          }
          return Math.min(prev + 2, 100);
        });
      }, 30);
      
      return () => clearInterval(completeInterval);
    }
  }, [isComplete]);

  React.useEffect(() => {
    return () => {
      if (onComplete) {
        onComplete();
      }
    };
  }, [onComplete]);

  const currentStage = thinkingStages[stageIndex];
  const CurrentIcon = currentStage.icon;

  return (
    <div className="space-y-4 animate-fade-in py-2">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
            <CurrentIcon className="w-4 h-4 text-primary animate-scale-in" />
          </div>
          <div className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium text-foreground mb-1 animate-fade-in">
            {currentStage.text}
          </div>
          <div className="flex items-center gap-2">
            <Progress value={progress} className="h-1.5 flex-1" />
            <span className="text-xs text-muted-foreground font-mono min-w-[3ch]">
              {Math.round(progress)}%
            </span>
          </div>
        </div>
      </div>
      
      {/* Stage indicators */}
      <div className="flex gap-2">
        {thinkingStages.map((stage, idx) => (
          <div
            key={idx}
            className={`flex-1 h-1 rounded-full transition-all duration-300 ${
              idx <= stageIndex 
                ? 'bg-primary' 
                : 'bg-muted'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
