import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { SUBSCRIPTION_TIERS, getPriceId, getPrice, getOriginalPrice } from "@/lib/subscriptionTiers";
import { toast } from "sonner";

export default function ChoosePlan() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("yearly");

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/signup");
        return;
      }
      setUser(user);
    };
    checkAuth();
  }, [navigate]);

  const handleCheckout = async (planKey: "basic" | "professional") => {
    if (!user) return;

    setLoading(planKey);
    try {
      const priceId = getPriceId(planKey, billingPeriod);
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId,
        },
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast.error(error.message || "Failed to start checkout");
    } finally {
      setLoading(null);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#101235] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-white">Choose Your Plan</h1>
          <p className="text-[#94a3b8] text-lg">Complete your signup by selecting a plan</p>
          <p className="text-sm font-semibold" style={{ color: "#1ce881" }}>
            30-Day Money-Back Guarantee • Cancel Anytime
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-1 p-1.5 rounded-full bg-[#1e293b] border border-[#334155]">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`px-6 py-2.5 rounded-full border-none cursor-pointer font-semibold text-sm transition-all ${
                billingPeriod === "monthly" ? "bg-white text-[#101235]" : "bg-transparent text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod("yearly")}
              className={`px-6 py-2.5 rounded-full border-none cursor-pointer font-semibold text-sm transition-all ${
                billingPeriod === "yearly" ? "bg-white text-[#101235]" : "bg-transparent text-white"
              }`}
            >
              Yearly
            </button>
            {billingPeriod === "yearly" && (
              <span
                className="px-3.5 py-1.5 rounded-full text-xs font-bold text-[#101235]"
                style={{ background: "linear-gradient(135deg, #1ce881 0%, #24ffc9 100%)" }}
              >
                Launch Pricing
              </span>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Basic Plan */}
          <Card className="relative border-2 border-[#334155] bg-[#1e293b] hover:border-[#1ce881]/50 transition-all">
            <CardHeader>
              <div>
                <CardTitle className="text-2xl text-white">{SUBSCRIPTION_TIERS.basic.name}</CardTitle>
                <CardDescription className="text-[#94a3b8]">{SUBSCRIPTION_TIERS.basic.description}</CardDescription>
              </div>
              <div className="pt-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-white">${getPrice("basic", billingPeriod)}</span>
                  <span className="text-[#94a3b8]">/month</span>
                  {getOriginalPrice("basic", billingPeriod) &&
                    getOriginalPrice("basic", billingPeriod) !== getPrice("basic", billingPeriod) && (
                      <span className="text-sm text-[#64748b] line-through">
                        ${getOriginalPrice("basic", billingPeriod)}/mo
                      </span>
                    )}
                </div>
                {billingPeriod === "yearly" && (
                  <div className="text-sm text-[#1ce881] font-medium mt-1">
                    Billed annually (${(getPrice("basic", billingPeriod) || 0) * 12}/year)
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <ul className="space-y-3">
                {SUBSCRIPTION_TIERS.basic.features.map((feature, idx) => {
                  const isComingSoon = SUBSCRIPTION_TIERS.basic.comingSoon?.includes(feature);
                  return (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-[#1ce881] shrink-0 mt-0.5" />
                      <span className={isComingSoon ? "text-[#64748b]" : "text-[#cbd5e1]"}>
                        {feature}
                        {isComingSoon && (
                          <Badge variant="outline" className="ml-2 text-xs border-[#334155] text-[#64748b]">
                            Coming soon
                          </Badge>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <Button
                onClick={() => handleCheckout("basic")}
                disabled={loading !== null}
                className="w-full text-[#101235] font-semibold"
                size="lg"
                style={{ background: "linear-gradient(135deg, #1ce881 0%, #24ffc9 100%)" }}
              >
                {loading === "basic" ? "Processing..." : "Get Started"}
              </Button>
            </CardContent>
          </Card>

          {/* Professional Plan */}
          <Card className="relative border-2 border-[#1ce881] bg-[#1e293b] shadow-[0_20px_50px_rgba(28,232,129,0.2)]">
            <div
              className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-sm font-semibold text-[#101235]"
              style={{ background: "linear-gradient(135deg, #1ce881 0%, #24ffc9 100%)" }}
            >
              Most Popular
            </div>
            <CardHeader>
              <div>
                <CardTitle className="text-2xl text-white">{SUBSCRIPTION_TIERS.professional.name}</CardTitle>
                <CardDescription className="text-[#94a3b8]">
                  {SUBSCRIPTION_TIERS.professional.description}
                </CardDescription>
              </div>
              <div className="pt-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-white">${getPrice("professional", billingPeriod)}</span>
                  <span className="text-[#94a3b8]">/month</span>
                  {getOriginalPrice("professional", billingPeriod) &&
                    getOriginalPrice("professional", billingPeriod) !== getPrice("professional", billingPeriod) && (
                      <span className="text-sm text-[#64748b] line-through">
                        ${getOriginalPrice("professional", billingPeriod)}/mo
                      </span>
                    )}
                </div>
                {billingPeriod === "yearly" && (
                  <div className="text-sm text-[#1ce881] font-medium mt-1">
                    Billed annually (${(getPrice("professional", billingPeriod) || 0) * 12}/year)
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <ul className="space-y-3">
                {SUBSCRIPTION_TIERS.professional.features.map((feature, idx) => {
                  const isComingSoon = SUBSCRIPTION_TIERS.professional.comingSoon?.includes(feature);
                  return (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-[#1ce881] shrink-0 mt-0.5" />
                      <span className={isComingSoon ? "text-[#64748b]" : "text-[#cbd5e1]"}>
                        {feature}
                        {isComingSoon && (
                          <Badge variant="outline" className="ml-2 text-xs border-[#334155] text-[#64748b]">
                            Coming soon
                          </Badge>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <Button
                onClick={() => handleCheckout("professional")}
                disabled={loading !== null}
                className="w-full text-[#101235] font-semibold"
                size="lg"
                style={{ background: "linear-gradient(135deg, #1ce881 0%, #24ffc9 100%)" }}
              >
                {loading === "professional" ? "Processing..." : "Get Started"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="text-center space-y-2 pt-4">
          <p className="text-sm text-[#94a3b8]">
            ⚠️ <strong className="text-white">Payment Required:</strong> You must complete payment to access your
            account.
          </p>
          <p className="text-xs text-[#64748b]">After payment, you can log in and start using whiskr.</p>
        </div>
      </div>
    </div>
  );
}
