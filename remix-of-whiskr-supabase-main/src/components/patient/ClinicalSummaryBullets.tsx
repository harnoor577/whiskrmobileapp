import { useClinicalSummary } from '@/hooks/use-clinical-summary';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';

interface ClinicalSummaryBulletsProps {
  consultId: string;
  existingSummary?: string | null;
  fallbackBullets: string[];
}

export function ClinicalSummaryBullets({
  consultId,
  existingSummary,
  fallbackBullets,
}: ClinicalSummaryBulletsProps) {
  const { summary, loading, error } = useClinicalSummary(consultId, existingSummary);

  // Show loading skeleton
  if (loading) {
    return (
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  // If we have an AI summary, parse and display it
  if (summary) {
    const bullets = summary
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('•'))
      .map(line => line.substring(1).trim());

    if (bullets.length > 0) {
      return (
        <ul className="space-y-1 text-sm">
          {bullets.map((bullet, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-muted-foreground">•</span>
              <span className="text-foreground">{bullet}</span>
            </li>
          ))}
        </ul>
      );
    }
  }

  // Show error state with fallback
  if (error) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <AlertCircle className="h-3 w-3" />
          <span>AI summary unavailable</span>
        </div>
        <ul className="space-y-1 text-sm">
          {fallbackBullets.map((bullet, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-muted-foreground">•</span>
              <span className="text-foreground">{bullet}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Fallback to static extraction if no summary
  return (
    <ul className="space-y-1 text-sm">
      {fallbackBullets.map((bullet, idx) => (
        <li key={idx} className="flex items-start gap-2">
          <span className="text-muted-foreground">•</span>
          <span className="text-foreground">{bullet}</span>
        </li>
      ))}
    </ul>
  );
}
