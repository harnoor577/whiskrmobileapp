import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

const GRACE_PERIOD_DAYS = 7;

export function useTrialStatus() {
  const { clinicId, user } = useAuth();

  const { data: clinic, isLoading } = useQuery({
    queryKey: ['trial-status', clinicId],
    queryFn: async () => {
      if (!clinicId) return null;
      const { data, error } = await supabase
        .from('clinics')
        .select('subscription_status, trial_ends_at, complimentary_trial_granted')
        .eq('id', clinicId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!clinicId && !!user,
    refetchInterval: 30000, // Check every 30 seconds
  });

  // Check subscription status
  const { data: subscriptionData } = useQuery({
    queryKey: ['subscription-status', user?.id],
    queryFn: async () => {
      // Refresh session before checking subscription to ensure valid token
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.log('Session refresh failed:', refreshError);
        return { subscribed: false };
      }

      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (error) {
        console.log('Subscription check error:', error);
        // Handle all errors gracefully - return default state instead of throwing
        return { subscribed: false };
      }
      return data;
    },
    enabled: !!user,
    retry: false,
    staleTime: 30000, // Cache for 30 seconds to prevent excessive refetching
  });

  const isTrialExpired = clinic?.subscription_status === 'trial' && 
                        clinic?.trial_ends_at && 
                        new Date(clinic.trial_ends_at) < new Date();
  
  const hasActiveSubscription = subscriptionData?.subscribed === true;
  
  // Check if subscription is cancelled and the cancellation period has ended
  const isCancelledAndExpired = subscriptionData?.cancel_at_period_end === true &&
                                subscriptionData?.subscription_end &&
                                new Date(subscriptionData.subscription_end) < new Date();
  
  const isTrial = clinic?.subscription_status === 'trial';
  const isFree = clinic?.subscription_status === 'free';
  const hasComplimentaryTrial = clinic?.complimentary_trial_granted === true;
  
  // Check for past_due or unpaid status (payment failed)
  const isPastDue = clinic?.subscription_status === 'past_due';
  const isUnpaid = clinic?.subscription_status === 'unpaid';
  const hasPaymentIssue = isPastDue || isUnpaid;
  
  // For now, without payment_failed_at column, we can't calculate grace period
  // Use a simpler approach based on subscription status
  const paymentFailedAt = null;
  const gracePeriodEndsAt = null;
  const isGracePeriodExpired = false;
  
  // Calculate days remaining in grace period
  const gracePeriodDaysRemaining = null;
  
  // User is blocked if:
  // 1. They have payment issues AND grace period has expired
  // 2. OR their subscription is 'unpaid' (Stripe has given up retrying)
  const isPaymentBlocked = (hasPaymentIssue && isGracePeriodExpired) || isUnpaid;
  
  // User needs to upgrade if:
  // 1. They have 'free' status (no subscription, no trial)
  // 2. OR they had a trial that expired and don't have active subscription
  // 3. OR their subscription was cancelled and the period has ended
  const needsUpgrade = isFree || (isTrialExpired && !hasActiveSubscription) || isCancelledAndExpired;

  return {
    isTrialExpired: isTrialExpired && !hasActiveSubscription,
    hasActiveSubscription,
    isTrial,
    isFree,
    hasComplimentaryTrial,
    needsUpgrade,
    trialEndsAt: clinic?.trial_ends_at,
    isLoading,
    // Payment failure tracking
    isPastDue,
    isUnpaid,
    hasPaymentIssue,
    isPaymentBlocked,
    paymentFailedAt,
    gracePeriodEndsAt,
    gracePeriodDaysRemaining,
    isGracePeriodExpired,
  };
}
