export const SUBSCRIPTION_TIERS = {
  basic: {
    name: "Basic",
    description: "For solo practitioners",
    product_id: "prod_TMsaAINJaRiZ2w",
    price_monthly: "price_1SQ8pAJAHqeLPx41Nty3gCj8",
    price_yearly: "price_1SQ8pAJAHqeLPx41yearly", // TODO: Add real yearly price ID
    monthly_amount: 100,
    yearly_amount: 47,
    original_monthly_amount: 100, // No discount on monthly
    original_yearly_amount: 100, // Original yearly price before discount
    max_users: 3,
    max_devices: 3,
    consults_per_month: 100,
    features: [
      "SOAP, wellness & procedure notes",
      "Atlas clinical suggestions",
      "Multi-language support",
      "EzyVet integration",
      "Email support",
    ],
    comingSoon: [] as string[],
  },
  professional: {
    name: "Pro",
    description: "For growing practices",
    product_id: "prod_TMsb4wwa7X3SyE",
    price_monthly: "price_1SQ8poJAHqeLPx41tLSrz9zX",
    price_yearly: "price_1SQ8poJAHqeLPx41yearly", // TODO: Add real yearly price ID
    monthly_amount: 200,
    yearly_amount: 97,
    original_monthly_amount: 200, // No discount on monthly
    original_yearly_amount: 200, // Original yearly price before discount
    max_users: 5,
    max_devices: 5,
    consults_per_month: 200,
    features: [
      "Everything in Basic",
      "Diagnostic image analysis",
      "Speaker detection",
      "Custom templates",
      "Priority support",
    ],
    comingSoon: ["Custom templates"] as string[],
  },
  enterprise: {
    name: "Enterprise",
    description: "For hospitals & groups",
    product_id: "prod_enterprise",
    price_monthly: "price_enterprise_monthly",
    price_yearly: "price_enterprise_yearly",
    monthly_amount: null, // custom pricing
    yearly_amount: null,
    original_monthly_amount: null,
    original_yearly_amount: null,
    max_users: -1, // unlimited
    max_devices: -1, // unlimited
    consults_per_month: -1, // unlimited
    features: [
      "Everything in Pro",
      "Multi-location support",
      "Custom integrations",
      "Dedicated onboarding",
      "24/7 phone support",
    ],
    comingSoon: ["Custom integrations"] as string[],
  },
} as const;

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;

export function getTierByProductId(productId: string): SubscriptionTier | null {
  for (const [key, value] of Object.entries(SUBSCRIPTION_TIERS)) {
    if (value.product_id === productId) {
      return key as SubscriptionTier;
    }
  }
  return null;
}

export function getPrice(tier: SubscriptionTier, period: "monthly" | "yearly") {
  const tierData = SUBSCRIPTION_TIERS[tier];
  return period === "yearly" ? tierData.yearly_amount : tierData.monthly_amount;
}

export function getOriginalPrice(tier: SubscriptionTier, period: "monthly" | "yearly") {
  const tierData = SUBSCRIPTION_TIERS[tier];
  return period === "yearly" ? tierData.original_yearly_amount : tierData.original_monthly_amount;
}

export function getPriceId(tier: SubscriptionTier, period: "monthly" | "yearly") {
  const tierData = SUBSCRIPTION_TIERS[tier];
  return period === "yearly" ? tierData.price_yearly : tierData.price_monthly;
}
