import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { Check, Zap, TrendingUp, Building2, Mail } from "lucide-react";
import { useState } from "react";
import { EnterpriseContactForm } from "./EnterpriseContactForm";

interface UpgradePlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason?: "consult_limit" | "feature_locked";
  consultInfo?: {
    used: number;
    cap: number;
  };
  currentTier?: string;
}

export function UpgradePlanModal({
  open,
  onOpenChange,
  reason = "consult_limit",
  consultInfo,
  currentTier,
}: UpgradePlanModalProps) {
  const navigate = useNavigate();
  const [enterpriseFormOpen, setEnterpriseFormOpen] = useState(false);

  const handleUpgrade = () => {
    onOpenChange(false);
    navigate("/billing");
  };

  const handleContactSales = () => {
    setEnterpriseFormOpen(true);
  };

  const allPlans = [
    {
      name: "Basic",
      tier: "basic",
      icon: Zap,
      price: "$47",
      period: "/month",
      consults: "100 consults/month",
      features: ["AI-powered SOAP notes", "Voice transcription", "Basic analytics", "Email support"],
    },
    {
      name: "Professional",
      tier: "professional",
      icon: TrendingUp,
      price: "$97",
      period: "/month",
      consults: "200 consults/month",
      features: [
        "Everything in Basic",
        "Advanced AI diagnostics",
        "Priority support",
        "Custom templates",
        "Team collaboration",
      ],
      popular: true,
    },
    {
      name: "Enterprise",
      tier: "enterprise",
      icon: Building2,
      price: "Custom",
      period: "",
      consults: "Unlimited consults",
      features: [
        "Everything in Professional",
        "Unlimited consultations",
        "Dedicated support",
        "Custom integrations",
        "Advanced security",
      ],
      contactSales: true,
    },
  ];

  // Filter plans based on current tier
  const getVisiblePlans = () => {
    const normalizedTier = currentTier?.toLowerCase() || "free";

    if (normalizedTier === "professional") {
      // Pro users only see Enterprise option
      return allPlans.filter((plan) => plan.tier === "enterprise");
    } else if (normalizedTier === "basic") {
      // Basic users see Professional and Enterprise
      return allPlans.filter((plan) => plan.tier === "professional" || plan.tier === "enterprise");
    } else {
      // Free/trial users see all plans
      return allPlans;
    }
  };

  const plans = getVisiblePlans();

  // Determine grid columns based on number of visible plans
  const getGridCols = () => {
    if (plans.length === 1) return "md:grid-cols-1 max-w-md mx-auto";
    if (plans.length === 2) return "md:grid-cols-2 max-w-2xl mx-auto";
    return "md:grid-cols-3";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`sm:max-w-[900px] max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle className="text-2xl">Upgrade Your Plan</DialogTitle>
          <DialogDescription>
            {reason === "consult_limit" && consultInfo ? (
              <>
                You've used all {consultInfo.used} of your {consultInfo.cap} consults this billing period. Choose a plan
                to continue.
              </>
            ) : currentTier?.toLowerCase() === "professional" ? (
              <>Ready to go unlimited? Contact our sales team to upgrade to Enterprise.</>
            ) : (
              <>Choose a plan that fits your practice's needs.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className={`grid gap-6 ${getGridCols()} mt-4`}>
          {plans.map((plan) => (
            <Card key={plan.name} className={`relative ${plan.popular ? "border-primary shadow-lg" : ""}`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-medium">
                    Most Popular
                  </span>
                </div>
              )}
              <CardHeader className="text-center pb-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <plan.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription className="text-sm font-medium text-primary">{plan.consults}</CardDescription>
                <div className="mt-4">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  {plan.period && <span className="text-muted-foreground">{plan.period}</span>}
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                {plan.contactSales ? (
                  <Button className="w-full gap-2" variant="outline" onClick={handleContactSales}>
                    <Mail className="h-4 w-4" />
                    Contact Sales
                  </Button>
                ) : (
                  <Button className="w-full" variant={plan.popular ? "default" : "outline"} onClick={handleUpgrade}>
                    Select Plan
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>All plans include a 30-day money-back guarantee</p>
        </div>
      </DialogContent>

      <EnterpriseContactForm open={enterpriseFormOpen} onOpenChange={setEnterpriseFormOpen} />
    </Dialog>
  );
}
