import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface LoadingStage {
  id: string;
  label: string;
  completed: boolean;
}

interface DashboardLoaderProps {
  stage: 'auth' | 'data';
}

const motivationalCopy = [
  "Keeping your notes real-time.",
  "Cutting tonight's after-hours charting.",
  "Optimizing your workflow.",
  "Making documentation effortless.",
];

export function DashboardLoader({ stage }: DashboardLoaderProps) {
  const [stages, setStages] = useState<LoadingStage[]>([
    { id: 'auth', label: 'Authenticating session', completed: false },
    { id: 'metrics', label: 'Loading metrics', completed: false },
    { id: 'dashboard', label: 'Preparing dashboard', completed: false },
  ]);
  
  const [currentCopy, setCurrentCopy] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Rotate motivational copy
    const copyInterval = setInterval(() => {
      setCurrentCopy((prev) => (prev + 1) % motivationalCopy.length);
    }, 2000);

    return () => clearInterval(copyInterval);
  }, []);

  useEffect(() => {
    // Progress animation
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 300);

    return () => clearInterval(progressInterval);
  }, []);

  useEffect(() => {
    // Stage completion simulation
    if (stage === 'auth') {
      setStages((prev) =>
        prev.map((s, i) => ({
          ...s,
          completed: i === 0,
        }))
      );
      setProgress(33);
    } else if (stage === 'data') {
      setTimeout(() => {
        setStages((prev) =>
          prev.map((s, i) => ({
            ...s,
            completed: i <= 1,
          }))
        );
        setProgress(66);
      }, 300);
      
      setTimeout(() => {
        setStages((prev) =>
          prev.map((s) => ({
            ...s,
            completed: true,
          }))
        );
        setProgress(100);
      }, 600);
    }
  }, [stage]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background to-muted/30">
      <div className="w-full max-w-md px-6 space-y-8 animate-fade-in">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-[#18A999] blur-xl opacity-30 animate-pulse" />
              <Loader2 className="h-12 w-12 text-[#18A999] animate-spin relative" />
            </div>
          </div>
          <h2 className="text-2xl font-semibold text-foreground">
            {stage === 'auth' ? 'Signing you in...' : 'Fetching your clinic snapshot...'}
          </h2>
          <p className="text-sm text-muted-foreground animate-fade-in" key={currentCopy}>
            {motivationalCopy[currentCopy]}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-center text-muted-foreground">
            {Math.round(progress)}% complete
          </p>
        </div>

        {/* Checklist */}
        <div className="bg-card border rounded-lg p-6 shadow-sm space-y-4">
          {stages.map((stage, index) => (
            <div
              key={stage.id}
              className="flex items-center gap-3 transition-all duration-300"
              style={{ animationDelay: `${index * 150}ms` }}
            >
              <div className="flex-shrink-0">
                {stage.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-[#2BB673] animate-scale-in" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-muted" />
                )}
              </div>
              <span
                className={`text-sm transition-colors ${
                  stage.completed ? 'text-foreground font-medium' : 'text-muted-foreground'
                }`}
              >
                {stage.label}
              </span>
            </div>
          ))}
        </div>

        {/* Footer Message */}
        <p className="text-xs text-center text-muted-foreground">
          Setting up your personalized workspace...
        </p>
      </div>
    </div>
  );
}
