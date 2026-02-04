import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useConsultUsage } from '@/hooks/use-consult-usage';

export function ConsultCapBanner() {
  const navigate = useNavigate();
  const { hasReachedCap, consultsUsed, consultsCap, isUnlimited } = useConsultUsage();

  if (isUnlimited || !hasReachedCap) return null;

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <span>
          You've reached your consult limit ({consultsUsed}/{consultsCap}). 
          Upgrade your plan to create more consults this period.
        </span>
        <Button 
          variant="secondary" 
          size="sm"
          onClick={() => navigate('/billing')}
        >
          Upgrade Plan
        </Button>
      </AlertDescription>
    </Alert>
  );
}
