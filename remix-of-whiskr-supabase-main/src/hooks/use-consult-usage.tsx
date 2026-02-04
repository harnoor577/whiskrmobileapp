import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export function useConsultUsage() {
  const { clinicId, user } = useAuth();

  const { data: clinic, isLoading } = useQuery({
    queryKey: ['consult-usage', clinicId],
    queryFn: async () => {
      if (!clinicId) return null;
      const { data, error } = await supabase
        .from('clinics')
        .select('consults_used_this_period, consults_cap, trial_consults_cap, subscription_status, subscription_tier, billing_cycle_start_date')
        .eq('id', clinicId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!clinicId && !!user,
    refetchInterval: 5000,
  });

  const isTrial = clinic?.subscription_status === 'trial';
  const consultsCap = isTrial ? clinic?.trial_consults_cap : clinic?.consults_cap;
  const consultsUsed = clinic?.consults_used_this_period || 0;
  const isUnlimited = clinic?.subscription_tier === 'enterprise';
  const hasReachedCap = !isUnlimited && consultsUsed >= (consultsCap || 0);
  
  // Calculate next reset date (billing cycle start date + 1 month)
  // Ensure the reset date is always in the future
  const calculateNextResetDate = () => {
    if (!clinic?.billing_cycle_start_date) return null;
    
    const billingStart = new Date(clinic.billing_cycle_start_date);
    const now = new Date();
    let nextReset = new Date(billingStart);
    nextReset.setMonth(billingStart.getMonth() + 1);
    
    // If calculated date is in the past, keep adding months until it's in the future
    while (nextReset <= now) {
      nextReset.setMonth(nextReset.getMonth() + 1);
    }
    
    return nextReset;
  };
  
  const nextResetDate = calculateNextResetDate();

  return {
    consultsUsed,
    consultsCap: isUnlimited ? -1 : consultsCap,
    hasReachedCap,
    isUnlimited,
    isTrial,
    nextResetDate,
    isLoading,
    currentTier: clinic?.subscription_tier || 'free',
  };
}
