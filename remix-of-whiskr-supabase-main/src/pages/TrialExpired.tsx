import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Check, ExternalLink, Clock } from 'lucide-react';
import { SUBSCRIPTION_TIERS } from '@/lib/subscriptionTiers';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';

export default function TrialExpired() {
  const { signOut, clinicId } = useAuth();
  const [loading, setLoading] = useState(false);

  // Fetch clinic data
  const { data: clinic } = useQuery({
    queryKey: ['clinic', clinicId],
    queryFn: async () => {
      if (!clinicId) return null;
      const { data, error } = await supabase
        .from('clinics')
        .select('subscription_status')
        .eq('id', clinicId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!clinicId,
  });

  // Determine the message based on subscription status
  const isCancelled = clinic?.subscription_status === 'active';
  const headerMessage = isCancelled 
    ? "Subscription Access Ended"
    : "Your Free Trial Has Ended";
  const subMessage = isCancelled
    ? "Resubscribe now to continue accessing your veterinary AI assistant and all patient records"
    : "Upgrade now to continue accessing your veterinary AI assistant and all patient records";

  const handleCheckout = async (priceId: string, plan?: 'basic' | 'professional') => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId, plan },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, '_blank');
        toast.success('Opening checkout...');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to create checkout session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl space-y-6">
        {/* Header Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-4">
            <Clock className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-4xl font-bold">{headerMessage}</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {subMessage}
          </p>
        </div>

        {/* Pricing Tiers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.entries(SUBSCRIPTION_TIERS).map(([key, tier]) => {
            const price = tier.monthly_amount;
            const priceId = tier.price_monthly;
            const isRecommended = key === 'professional';

            return (
              <Card key={key} className={isRecommended ? 'border-primary shadow-xl scale-105' : 'shadow-lg'}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-2xl">{tier.name}</CardTitle>
                    {isRecommended && (
                      <Badge className="bg-primary">Recommended</Badge>
                    )}
                  </div>
                  <div className="mt-4">
                    {price ? (
                      <>
                        <span className="text-5xl font-bold">${price}</span>
                        <span className="text-muted-foreground text-lg">/month</span>
                      </>
                    ) : (
                      <span className="text-5xl font-bold">Custom</span>
                    )}
                  </div>
                  <CardDescription className="text-base">
                    {tier.max_users === -1 ? 'Custom' : `Up to ${tier.max_users} users`}
                    <br />
                    {tier.consults_per_month === -1 ? 'Unlimited consults' : `${tier.consults_per_month} consults/month`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ul className="space-y-3">
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm">
                        <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={() => handleCheckout(priceId, (key === 'basic' || key === 'professional') ? (key as 'basic' | 'professional') : undefined)}
                    disabled={loading}
                    className="w-full text-base py-6"
                    size="lg"
                    variant={isRecommended ? 'default' : 'outline'}
                  >
                    {isCancelled ? 'Resubscribe to' : 'Upgrade to'} {tier.name}
                    <ExternalLink className="h-5 w-5 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Sign Out Option */}
        <div className="text-center pt-4">
          <Button variant="ghost" onClick={signOut}>
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
