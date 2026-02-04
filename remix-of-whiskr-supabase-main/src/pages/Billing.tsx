import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Check, CreditCard, Calendar, ExternalLink, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  SUBSCRIPTION_TIERS,
  getTierByProductId,
  getPrice,
  getOriginalPrice,
  getPriceId,
} from "@/lib/subscriptionTiers";
import { UsageMeter } from "@/components/layout/UsageMeter";
import { EnterpriseContactForm } from "@/components/billing/EnterpriseContactForm";

export default function Billing() {
  const { user, clinicId, userRole } = useAuth();
  const [loading, setLoading] = useState(false);
  const [enterpriseFormOpen, setEnterpriseFormOpen] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("yearly");

  // Fetch subscription status using clinicId (supports super admin viewing other accounts)
  const { data: subscriptionData, refetch } = useQuery({
    queryKey: ["subscription-status", clinicId],
    queryFn: async () => {
      if (!clinicId) return null;

      // Refresh session before checking subscription to ensure valid token
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.log("Session refresh failed:", refreshError);
        return null;
      }

      const { data, error } = await supabase.functions.invoke("check-subscription", {
        body: { clinicId },
      });
      if (error) {
        // Handle authentication errors gracefully
        if (error.message?.includes("Session expired") || error.message?.includes("Not authenticated")) {
          return null;
        }
        console.error("Subscription check error:", error);
        return null;
      }
      return data;
    },
    enabled: !!clinicId,
    retry: false,
    refetchInterval: 60000, // Refetch every minute
  });

  // Fetch clinic info
  const { data: clinic, refetch: refetchClinic } = useQuery({
    queryKey: ["clinic", clinicId],
    queryFn: async () => {
      if (!clinicId) return null;
      const { data, error } = await supabase.from("clinics").select("*").eq("id", clinicId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!clinicId,
  });
  const { data: billingData, refetch: refetchBilling } = useQuery({
    queryKey: ["billing-data", clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("list-payments", {
        body: { clinicId },
      });
      if (error) throw error;
      return data || { invoices: [], default_payment_method_summary: null };
    },
    enabled: !!clinicId,
    refetchInterval: 60000,
  });
  const handleCheckout = async (priceId: string, planKey: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
        setTimeout(() => refetch(), 3000);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to create checkout session");
    } finally {
      setLoading(false);
    }
  };
  const handleManageSubscription = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) {
        // Show helpful message if portal not configured
        if (error.message?.includes("configuration") || error.message?.includes("portal")) {
          toast.error("Customer portal is not set up yet. Please contact support.");
        } else {
          toast.error(error.message || "Failed to open customer portal");
        }
        return;
      }
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to open customer portal");
    } finally {
      setLoading(false);
    }
  };
  const handleRefreshStatus = async () => {
    setLoading(true);
    try {
      // Pass clinicId to handle multi-clinic users
      await supabase.functions.invoke("sync-subscription", {
        body: { clinicId },
      });
      await Promise.all([refetch(), refetchClinic?.(), refetchBilling?.()]);
      toast.success("Subscription status refreshed");
    } catch (e: any) {
      toast.error(e.message || "Failed to refresh");
    } finally {
      setLoading(false);
    }
  };
  // Auto-sync on page load and when subscription status changes
  useEffect(() => {
    if (user && clinicId) {
      // Always sync on page load to catch any changes from Stripe
      // Pass the clinicId in the request body to handle multi-clinic users
      supabase.functions
        .invoke("sync-subscription", {
          body: { clinicId },
        })
        .then(() => {
          refetchClinic?.();
          refetch();
          refetchBilling?.();
        })
        .catch(() => {});
    }
  }, [user?.id, clinicId]);

  // Use clinic data as source of truth for multi-clinic support
  const currentTier = (clinic?.subscription_tier as any) || "free";
  const isFree = clinic?.subscription_status === "free";
  const isTrial = clinic?.subscription_status === "trial";
  const isSubscribed = clinic?.subscription_status === "active" || clinic?.subscription_status === "trialing";
  const trialExpired = isTrial && clinic?.trial_ends_at && new Date(clinic.trial_ends_at) < new Date();
  const daysRemaining = clinic?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(clinic.trial_ends_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const needsUpgrade = isFree || (trialExpired && !isSubscribed);

  // Only admins can access billing
  if (userRole !== "admin" && userRole !== "super_admin") {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">Admin access required to manage billing</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Billing & Subscription</h1>
        <p className="text-muted-foreground">Manage your subscription and billing</p>
      </div>

      {/* Current Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>Your subscription status and details</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isSubscribed && (
                <Button onClick={handleManageSubscription} disabled={loading}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  {subscriptionData?.cancel_at_period_end
                    ? "Resubscribe or Manage Subscription"
                    : "Manage or Cancel Subscription"}
                </Button>
              )}
              {!isSubscribed && !isFree && (
                <Button onClick={() => (window.location.href = "/billing")} variant="default">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Choose a Plan
                </Button>
              )}
              <Button variant="outline" onClick={handleRefreshStatus} disabled={loading}>
                Refresh Status
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="space-y-1">
              <p className="text-sm font-medium">Status</p>
              <p className="text-2xl font-bold">
                {isSubscribed && currentTier && SUBSCRIPTION_TIERS[currentTier]
                  ? SUBSCRIPTION_TIERS[currentTier].name
                  : isTrial
                    ? "Free Trial"
                    : "Free"}
              </p>
            </div>

            {/* Subscription Status Badge */}
            {isSubscribed && !subscriptionData?.cancel_at_period_end && (
              <Badge variant="default" className="bg-green-600 text-white border-green-600">
                Active
              </Badge>
            )}
            {subscriptionData?.cancel_at_period_end && (
              <Badge variant="outline" className="border-amber-600 text-amber-600">
                {subscriptionData?.subscription_end
                  ? `Cancels on ${format(new Date(subscriptionData.subscription_end), "MMM d, yyyy")}`
                  : "Cancels at period end"}
              </Badge>
            )}

            {isTrial && (
              <Badge variant={trialExpired ? "destructive" : "secondary"} className="text-sm">
                <Calendar className="h-3 w-3 mr-1" />
                {trialExpired ? "Trial Expired" : `${daysRemaining} days left`}
              </Badge>
            )}
            {isFree && (
              <Badge variant="outline" className="text-sm">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Subscription Required
              </Badge>
            )}
          </div>

          {/* Usage Meter */}
          <div className="pt-4 border-t">
            <UsageMeter />
          </div>

          {subscriptionData?.subscription_end && (
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Rebill date: {format(new Date(subscriptionData.subscription_end), "MMMM d, yyyy")}
              </p>
            </div>
          )}

          {/* Cancellation Warning */}
          {subscriptionData?.cancel_at_period_end && subscriptionData?.subscription_end && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg space-y-3">
              <p className="text-sm font-semibold text-destructive">Subscription Cancelled</p>
              <p className="text-sm">
                Your subscription will end on {format(new Date(subscriptionData.subscription_end), "MMMM d, yyyy")}.
                After this date, you'll lose access to all premium features. Click "Resubscribe" above to continue your
                subscription.
              </p>
            </div>
          )}

          {needsUpgrade && (
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <p className="text-sm font-semibold">{isFree ? "Subscription Required" : "Trial Expired"}</p>
              <p className="text-sm">
                {isFree
                  ? "Choose a plan below to start using whiskr and access all features."
                  : "Your trial has expired. Choose a plan below to continue using all features."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing Toggle */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1 p-1.5 rounded-full bg-muted border border-border">
          <button
            onClick={() => setBillingPeriod("monthly")}
            className={`px-6 py-2.5 rounded-full border-none cursor-pointer font-semibold text-sm transition-all ${
              billingPeriod === "monthly" ? "bg-primary text-primary-foreground" : "bg-transparent text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingPeriod("yearly")}
            className={`px-6 py-2.5 rounded-full border-none cursor-pointer font-semibold text-sm transition-all ${
              billingPeriod === "yearly" ? "bg-primary text-primary-foreground" : "bg-transparent text-foreground"
            }`}
          >
            Yearly
          </button>
          {billingPeriod === "yearly" && (
            <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-primary text-primary-foreground">
              Launch Pricing
            </span>
          )}
        </div>
      </div>

      {/* Pricing Tiers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Object.entries(SUBSCRIPTION_TIERS).map(([key, tier]) => {
          const isCurrentPlan = isSubscribed && currentTier === key;
          const tierKey = key as "basic" | "professional" | "enterprise";
          const price = getPrice(tierKey, billingPeriod);
          const originalPrice = getOriginalPrice(tierKey, billingPeriod);
          const priceId = getPriceId(tierKey, billingPeriod);
          return (
            <Card key={key} className={isCurrentPlan ? "border-primary shadow-lg" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{tier.name}</CardTitle>
                  {isCurrentPlan && <Badge>Current Plan</Badge>}
                </div>
                {tier.description && <p className="text-sm text-muted-foreground">{tier.description}</p>}
                <div className="mt-4">
                  {price ? (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-bold">${price}</span>
                        <span className="text-muted-foreground">/month</span>
                        {originalPrice && originalPrice !== price && (
                          <span className="text-sm text-muted-foreground line-through">${originalPrice}/mo</span>
                        )}
                      </div>
                      {billingPeriod === "yearly" && (
                        <p className="text-sm text-primary font-medium mt-1">Billed annually (${price * 12}/year)</p>
                      )}
                    </>
                  ) : (
                    <span className="text-4xl font-bold">Custom</span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  {tier.features.map((feature, idx) => {
                    const isComingSoon = tier.comingSoon?.includes(feature);
                    return (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                        <span className={isComingSoon ? "text-muted-foreground" : ""}>
                          {feature}
                          {isComingSoon && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              Coming soon
                            </Badge>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {key === "enterprise" ? (
                  <Button onClick={() => setEnterpriseFormOpen(true)} className="w-full">
                    Contact Sales
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      if (isSubscribed) {
                        // Route to customer portal for upgrades/downgrades
                        handleManageSubscription();
                      } else {
                        // First time subscription
                        handleCheckout(priceId, key);
                      }
                    }}
                    disabled={isCurrentPlan || loading}
                    className="w-full"
                    variant={isCurrentPlan ? "outline" : "default"}
                  >
                    {isCurrentPlan ? "Current Plan" : isSubscribed ? "Change Plan" : "Subscribe"}
                    {!isCurrentPlan && <ExternalLink className="h-4 w-4 ml-2" />}
                  </Button>
                )}
                {price && <p className="text-xs text-muted-foreground text-center">30-day money-back guarantee</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
          <CardDescription>Your past invoices and payments</CardDescription>
        </CardHeader>
        <CardContent>
          {billingData?.invoices && billingData.invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2">Date</th>
                    <th className="py-2">Plan</th>
                    <th className="py-2">Amount</th>
                    <th className="py-2">Coupon</th>
                    <th className="py-2">Payment Method</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {billingData.invoices.map((inv: any) => (
                    <tr key={inv.id} className="border-t">
                      <td className="py-2">{format(new Date(inv.created * 1000), "MMM d, yyyy")}</td>
                      <td className="py-2">{inv.plan_name || "—"}</td>
                      <td className="py-2">
                        {(inv.amount_paid / 100).toLocaleString(undefined, {
                          style: "currency",
                          currency: (inv.currency || "usd").toUpperCase(),
                        })}
                      </td>
                      <td className="py-2">{inv.coupon || "—"}</td>
                      <td className="py-2">{inv.payment_method || "—"}</td>
                      <td className="py-2 capitalize">{inv.status}</td>
                      <td className="py-2">
                        {inv.hosted_invoice_url ? (
                          <a
                            href={inv.hosted_invoice_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline"
                          >
                            View
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Alert>
              <AlertDescription>No payments found yet.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <EnterpriseContactForm open={enterpriseFormOpen} onOpenChange={setEnterpriseFormOpen} />
    </div>
  );
}
