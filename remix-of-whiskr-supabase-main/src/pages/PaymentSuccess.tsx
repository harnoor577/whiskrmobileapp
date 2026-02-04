import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, ArrowRight, Loader2 } from 'lucide-react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { SUBSCRIPTION_TIERS } from '@/lib/subscriptionTiers';

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const { user, refreshSubscription } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscriptionDetails, setSubscriptionDetails] = useState<{
    plan: string;
    price: string;
    status: string;
  } | null>(null);

  useEffect(() => {
    const fetchSubscriptionDetails = async () => {
      try {
        // Refresh session first to ensure valid token
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.error('Session refresh failed:', refreshError);
          setLoading(false);
          return;
        }

        // Refresh subscription status
        await refreshSubscription();

        // Get subscription details from backend
        const { data, error } = await supabase.functions.invoke('check-subscription');
        
        if (error) {
          // Handle authentication errors gracefully
          if (error.message?.includes('Session expired') || error.message?.includes('Not authenticated')) {
            console.log('Session expired, subscription check skipped');
            setLoading(false);
            return;
          }
          console.error('Subscription check error:', error);
          setLoading(false);
          return;
        }
        
        if (data) {
          // Find the matching tier based on product_id
          const tier = Object.entries(SUBSCRIPTION_TIERS).find(
            ([_, details]) => details.product_id === data.product_id
          );

          if (tier) {
            const [planKey, planDetails] = tier;
            setSubscriptionDetails({
              plan: planDetails.name,
              price: planDetails.monthly_amount ? `$${planDetails.monthly_amount}/month` : 'Custom',
              status: data.subscribed ? 'Active' : 'Inactive',
            });
          }
        }
      } catch (error) {
        console.error('Error fetching subscription details:', error);
      } finally {
        setLoading(false);
      }
    };

    // Give Stripe a moment to process the payment
    const timer = setTimeout(() => {
      fetchSubscriptionDetails();
    }, 2000);

    return () => clearTimeout(timer);
  }, [refreshSubscription]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-subtle">
      <Card className="w-full max-w-2xl shadow-elegant">
        <CardHeader className="text-center space-y-4 pb-4">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-green-500/10 flex items-center justify-center animate-in zoom-in duration-500">
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>
          </div>
          <div>
            <CardTitle className="text-3xl mb-2">Payment Successful!</CardTitle>
            <CardDescription className="text-base">
              Thank you for subscribing to whiskr
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Loading subscription details...</span>
            </div>
          ) : (
            <>
              {/* Order Details */}
              <div className="bg-muted/50 rounded-lg p-6 space-y-4">
                <h3 className="font-semibold text-lg">Subscription Details</h3>
                
                {subscriptionDetails ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Plan</span>
                      <span className="font-semibold">{subscriptionDetails.plan}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Price</span>
                      <span className="font-semibold">{subscriptionDetails.price}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Status</span>
                      <span className="font-semibold text-green-500">{subscriptionDetails.status}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-muted-foreground">Email</span>
                      <span className="font-medium">{user?.email}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Your subscription is being activated. You'll receive a confirmation email shortly.
                  </p>
                )}
              </div>

              {/* Next Steps */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">What's Next?</h3>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-sm font-semibold text-primary">1</span>
                    </div>
                    <div>
                      <p className="font-medium">Access Your Dashboard</p>
                      <p className="text-sm text-muted-foreground">
                        Start creating SOAP notes and managing your patients
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-sm font-semibold text-primary">2</span>
                    </div>
                    <div>
                      <p className="font-medium">Set Up Your Clinic</p>
                      <p className="text-sm text-muted-foreground">
                        Customize your clinic settings and invite team members
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-sm font-semibold text-primary">3</span>
                    </div>
                    <div>
                      <p className="font-medium">Explore AI Features</p>
                      <p className="text-sm text-muted-foreground">
                        Try voice dictation, AI-powered diagnostics, and automated reports
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button asChild size="lg" className="flex-1 group">
                  <Link to="/dashboard">
                    Go to Dashboard
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="flex-1">
                  <Link to="/billing">
                    View Billing
                  </Link>
                </Button>
              </div>

              {/* Support Note */}
              <div className="text-center pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Need help getting started?{' '}
                  <Link to="/support" className="text-primary hover:underline font-medium">
                    Contact Support
                  </Link>
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
