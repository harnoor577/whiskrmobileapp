import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePlanRestrictions() {
  const { clinicId } = useAuth();

  const { data: clinic } = useQuery({
    queryKey: ['clinic-plan', clinicId],
    queryFn: async () => {
      if (!clinicId) return null;
      const { data, error } = await supabase
        .from('clinics')
        .select('subscription_status, subscription_tier')
        .eq('id', clinicId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!clinicId,
  });

  const isBasicPlan = clinic?.subscription_status === 'active' && clinic?.subscription_tier === 'basic';
  const isTrial = clinic?.subscription_status === 'trial';
  const canUploadDiagnostics = !isBasicPlan; // Basic plan cannot upload diagnostics
  const canAccessAnalytics = clinic?.subscription_tier !== 'basic'; // Analytics not available on Basic

  return {
    isBasicPlan,
    isTrial,
    canUploadDiagnostics,
    canAccessAnalytics,
    subscriptionTier: clinic?.subscription_tier,
    subscriptionStatus: clinic?.subscription_status,
  };
}