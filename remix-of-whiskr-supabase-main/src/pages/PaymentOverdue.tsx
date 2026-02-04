import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle, CreditCard, Clock, LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { useTrialStatus } from '@/hooks/use-trial-status';

export default function PaymentOverdue() {
  const { signOut } = useAuth();
  const { gracePeriodDaysRemaining, isGracePeriodExpired, paymentFailedAt } = useTrialStatus();

  const handleUpdatePayment = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Error opening customer portal:', error);
      toast.error('Failed to open payment portal. Please try again.');
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'Unknown';
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-6">
      <Card className="w-full max-w-lg border-destructive/50 shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl font-bold text-destructive">
            {isGracePeriodExpired ? 'Account Suspended' : 'Payment Failed'}
          </CardTitle>
          <CardDescription className="text-base">
            {isGracePeriodExpired 
              ? 'Your account has been suspended due to an unpaid balance. Please update your payment method to restore access.'
              : 'We were unable to process your payment. Please update your payment method to avoid service interruption.'
            }
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Grace Period Status */}
          {!isGracePeriodExpired && gracePeriodDaysRemaining !== null && (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-warning" />
                <div>
                  <p className="font-semibold text-warning">
                    {gracePeriodDaysRemaining} day{gracePeriodDaysRemaining !== 1 ? 's' : ''} remaining
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Your access will be suspended if payment is not received
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Payment Failed Date */}
          {paymentFailedAt && (
            <div className="text-sm text-muted-foreground text-center">
              Payment failed on {formatDate(paymentFailedAt)}
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button 
              onClick={handleUpdatePayment} 
              className="w-full gap-2"
              size="lg"
            >
              <CreditCard className="h-4 w-4" />
              Update Payment Method
            </Button>
            
            <Button 
              variant="ghost" 
              onClick={signOut}
              className="w-full gap-2"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>

          {/* Help Text */}
          <p className="text-xs text-center text-muted-foreground">
            Need help? Contact support at{' '}
            <a href="mailto:support@whiskr.ai" className="text-primary hover:underline">
              support@whiskr.ai
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}