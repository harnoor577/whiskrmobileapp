import { useAuth } from '@/lib/auth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Shield, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function MasterAdminBanner() {
  const { userRole, viewAsClinicId, setViewAsClinicId, actualClinicId } = useAuth();

  // Fetch clinic name when viewing as another clinic
  const { data: viewingClinic } = useQuery({
    queryKey: ['viewing-clinic', viewAsClinicId],
    queryFn: async () => {
      if (!viewAsClinicId) return null;
      const { data } = await supabase
        .from('clinics')
        .select('name')
        .eq('id', viewAsClinicId)
        .maybeSingle();
      return data;
    },
    enabled: !!viewAsClinicId,
  });

  if (userRole !== 'super_admin' || !viewAsClinicId || viewAsClinicId === actualClinicId) {
    return null;
  }

  return (
    <Alert className="bg-yellow-500/10 border-yellow-500/50 rounded-none">
      <Shield className="h-4 w-4 text-yellow-600" />
      <AlertDescription className="flex items-center justify-between">
        <span className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
          Viewing as Master Admin: {viewingClinic?.name || 'Loading...'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setViewAsClinicId(null)}
          className="h-7 text-yellow-900 hover:text-yellow-950 dark:text-yellow-100 dark:hover:text-yellow-50"
        >
          <X className="h-4 w-4 mr-1" />
          Exit View
        </Button>
      </AlertDescription>
    </Alert>
  );
}