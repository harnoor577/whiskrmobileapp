import { Progress } from '@/components/ui/progress';
import { useConsultUsage } from '@/hooks/use-consult-usage';
import { format } from 'date-fns';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export function UsageMeter() {
  const { consultsUsed, consultsCap, isUnlimited, nextResetDate, hasReachedCap } = useConsultUsage();
  const navigate = useNavigate();

  if (isUnlimited) {
    return (
      <div className="text-sm text-muted-foreground">
        <span className="font-medium">Unlimited consults</span>
      </div>
    );
  }

  const percentage = consultsCap && consultsCap > 0 ? Math.min((consultsUsed / consultsCap) * 100, 100) : 0;
  const isNearLimit = percentage >= 85 && percentage < 100;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">
              {consultsUsed}
            </span>
            <span className="text-lg text-muted-foreground">
              / {consultsCap}
            </span>
            <span className="text-sm text-muted-foreground">
              consults
            </span>
          </div>
          {nextResetDate && (
            <span className="text-xs text-muted-foreground">
              Resets {format(nextResetDate, 'MMM d')}
            </span>
          )}
        </div>
        <Progress 
          value={percentage} 
          className="h-2" 
        />
      </div>

      {isNearLimit && (
        <Alert className="bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800">
          <TrendingUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-sm text-orange-800 dark:text-orange-200">
              You're at {Math.round(percentage)}% of your monthly limit. Consider upgrading to avoid interruptions.
            </span>
            <Button 
              variant="outline" 
              size="sm"
              className="ml-2 border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300"
              onClick={() => navigate('/billing')}
            >
              Upgrade
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {hasReachedCap && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-sm">
              You've reached your {consultsCap} consult limit for this billing period. Upgrade to continue.
            </span>
            <Button 
              variant="secondary" 
              size="sm"
              className="ml-2"
              onClick={() => navigate('/billing')}
            >
              Upgrade Now
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
