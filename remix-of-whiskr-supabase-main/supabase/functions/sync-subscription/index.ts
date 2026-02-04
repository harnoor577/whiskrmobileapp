import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SYNC-SUBSCRIPTION] ${step}${detailsStr}`);
};

// Map Stripe product IDs to internal tier keys
const PRODUCT_TO_TIER: Record<string, string> = {
  'prod_TMsaAINJaRiZ2w': 'basic',        // Basic $49/mo (original)
  'prod_TMsb4wwa7X3SyE': 'professional', // Professional $97/mo (original)
  'prod_TYBSeDmTOYk1bB': 'professional', // Professional (new price)
  'prod_TYBSham4XJYaXq': 'basic',        // Standard plan
  'prod_TYBSqzDnYP43Ow': 'enterprise',   // Premium/Enterprise plan
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    const token = authHeader.replace("Bearer ", "");

    // Get user
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get clinic_id for the user - use current clinic from context
    // For multi-clinic users, we need to get the clinic_id from the request body
    const body = await req.json().catch(() => ({}));
    let clinicId = body.clinicId;
    
    // If no clinicId provided, try to get from localStorage preference or first profile
    if (!clinicId) {
      const { data: profiles, error: profileErr } = await supabaseClient
        .from('profiles')
        .select('clinic_id')
        .eq('user_id', user.id);
      
      if (profileErr) throw new Error(`Profile lookup failed: ${profileErr.message}`);
      if (!profiles || profiles.length === 0) throw new Error(`Profile not found for user: ${user.id}`);
      
      // Use the first clinic if no preference specified
      clinicId = profiles[0].clinic_id;
      logStep("Using first clinic for user with multiple profiles", { clinicId, totalProfiles: profiles.length });
    }
    
    if (!clinicId) throw new Error('No clinic linked to user');

    // Locate Stripe customer
    let customers;
    try {
      customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length === 0) {
        const search = await stripe.customers.search({ query: `email:\"${user.email}\"`, limit: 1 });
        customers = search;
      }
    } catch (e: any) {
      logStep("Stripe customer lookup failed", { error: e.message });
      return new Response(JSON.stringify({ updated: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    if (customers.data.length === 0) {
      logStep("No Stripe customer found by email; trying invoice search by customer_email");
      try {
        const invSearch = await stripe.invoices.search({
          query: `customer_email:\"${user.email}\" AND status:\"paid\"`,
          limit: 1,
        });
        if (invSearch.data.length === 0) {
          logStep("No invoices found for email; cannot sync");
          return new Response(JSON.stringify({ updated: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
        }
        const invoice = invSearch.data[0];
        const derivedCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (!derivedCustomerId) {
          logStep("Invoice found but no customer id present");
          return new Response(JSON.stringify({ updated: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
        }
        customers = { data: [{ id: derivedCustomerId }] } as any;
        logStep("Derived customer from invoice", { customerId: derivedCustomerId, invoiceId: invoice.id });
      } catch (e: any) {
        logStep("Invoice search failed", { error: e.message });
        return new Response(JSON.stringify({ updated: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
      }
    }

    const customerId = customers.data[0].id;
    logStep("Found customer", { customerId });

    // Find an active or trialing subscription
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, limit: 10 });
    const selectable = subscriptions.data.find((s: any) => s.status === 'active' || s.status === 'trialing');

// Get current clinic data to check for complimentary trials
const { data: currentClinic } = await supabaseClient
  .from('clinics')
  .select('complimentary_trial_granted, trial_ends_at, subscription_tier, subscription_status, billing_cycle_start_date, consults_used_this_period, stripe_subscription_id')
  .eq('id', clinicId)
  .single();

// Check if there's an ACTIVE complimentary trial
const hasActiveComplimentaryTrial = 
  currentClinic?.complimentary_trial_granted === true &&
  currentClinic?.trial_ends_at &&
  new Date(currentClinic.trial_ends_at) > new Date();

let updates: any = { stripe_customer_id: customerId };

if (hasActiveComplimentaryTrial) {
  // PRESERVE complimentary trial data - only update Stripe reference fields
  logStep("Active complimentary trial detected - preserving trial data", {
    trialEndsAt: currentClinic.trial_ends_at,
    currentTier: currentClinic.subscription_tier,
    currentStatus: currentClinic.subscription_status
  });
  
  // Only store Stripe subscription ID for future reference (after trial expires)
  if (selectable) {
    updates.stripe_subscription_id = selectable.id;
    logStep("Stored Stripe subscription for post-trial reversion", { subscriptionId: selectable.id });
  }
  
  // DO NOT overwrite: subscription_status, subscription_tier, consults_cap, trial fields
  
} else if (selectable) {
  // No active complimentary trial - use Stripe data
  const productId = selectable.items.data[0].price.product as string;
  const tier = PRODUCT_TO_TIER[productId] ?? null;
  
  // Check if complimentary trial just expired
  const trialJustExpired = 
    currentClinic?.complimentary_trial_granted === true &&
    currentClinic?.trial_ends_at &&
    new Date(currentClinic.trial_ends_at) <= new Date() &&
    currentClinic?.subscription_status !== 'free';
  
  if (trialJustExpired) {
    logStep("Complimentary trial expired - reverting to Stripe subscription", {
      expiredAt: currentClinic.trial_ends_at,
      revertingToTier: tier
    });
  }
  
  updates.subscription_status = 'active';
  if (tier) updates.subscription_tier = tier;
  
  // Update consult caps for paid plans
  const tierCaps: Record<string, number> = { basic: 100, professional: 200 };
  if (tier && tierCaps[tier]) {
    updates.consults_cap = tierCaps[tier];
  }
  updates.stripe_subscription_id = selectable.id;
  
  const now = new Date();
  let currentBillingStart: Date | null = null;
  
  // Safely parse the billing cycle start date
  if (currentClinic?.billing_cycle_start_date) {
    const parsedDate = new Date(currentClinic.billing_cycle_start_date);
    // Check if the date is valid
    if (!isNaN(parsedDate.getTime())) {
      currentBillingStart = parsedDate;
    } else {
      logStep("Invalid billing_cycle_start_date detected", { 
        value: currentClinic.billing_cycle_start_date 
      });
    }
  }
  
  // Get Stripe's current period start to detect rebilling
  // Validate that current_period_start exists before using it
  let stripeBillingStart: Date;
  let stripeCurrentPeriod: string;
  
  if (!selectable.current_period_start) {
    logStep("Warning: subscription missing current_period_start", { subscriptionId: selectable.id });
    // Use current date as fallback
    stripeBillingStart = new Date();
    stripeCurrentPeriod = stripeBillingStart.toISOString().split('T')[0];
  } else {
    stripeBillingStart = new Date(selectable.current_period_start * 1000);
    stripeCurrentPeriod = stripeBillingStart.toISOString().split('T')[0];
  }
  
  // Detect plan change (upgrade/downgrade)
  const isPlanChange = currentClinic?.subscription_tier && 
                       currentClinic.subscription_tier !== tier &&
                       currentClinic.subscription_tier !== 'trial';
  
  // Detect billing cycle reset (rebilling event)
  const isBillingReset = currentBillingStart && 
    Math.abs(stripeBillingStart.getTime() - currentBillingStart.getTime()) > (24 * 60 * 60 * 1000); // More than 1 day difference
  
  // Detect subscription change (different subscription ID)
  const isSubscriptionChange = currentClinic?.stripe_subscription_id && 
    currentClinic.stripe_subscription_id !== selectable.id;
  
  // Reset consults if:
  // 1. No billing cycle exists (new subscription)
  // 2. Billing cycle has been reset by Stripe (rebilling)
  // 3. Plan changed (upgrade/downgrade) - give fresh start
  // 4. Subscription ID changed (cancelled and resubscribed)
  const shouldResetConsults = !currentBillingStart || isBillingReset || isPlanChange || isSubscriptionChange;
  
  if (shouldResetConsults) {
    updates.consults_used_this_period = 0;
    updates.notification_80_sent = false;
    updates.notification_95_sent = false;
    updates.billing_cycle_start_date = stripeCurrentPeriod;
    
    const reason = !currentBillingStart ? 'new subscription' :
                   isBillingReset ? 'billing cycle reset (rebilling)' :
                   isPlanChange ? `plan change (${currentClinic?.subscription_tier} → ${tier})` :
                   'subscription change';
    
    // Safely convert date to ISO string
    let oldStartDateStr: string | null = null;
    if (currentBillingStart && !isNaN(currentBillingStart.getTime())) {
      oldStartDateStr = currentBillingStart.toISOString();
    }
    
    logStep("Resetting consults and notifications", { 
      reason,
      oldStartDate: oldStartDateStr, 
      newStartDate: updates.billing_cycle_start_date,
      oldTier: currentClinic?.subscription_tier,
      newTier: tier
    });
  } else {
    // Safely convert date to ISO string
    let billingCycleDateStr: string | null = null;
    if (currentBillingStart && !isNaN(currentBillingStart.getTime())) {
      billingCycleDateStr = currentBillingStart.toISOString();
    }
    
    logStep("Preserving current consults count", { 
      consultsUsed: currentClinic?.consults_used_this_period,
      billingCycleStartDate: billingCycleDateStr,
      tier
    });
  }
  
  logStep("Active/trialing subscription found", { subscriptionId: selectable.id, productId, tier });
} else {
  // No Stripe subscription found
  // Check if complimentary trial just expired with no Stripe fallback
  const trialJustExpired = 
    currentClinic?.complimentary_trial_granted === true &&
    currentClinic?.trial_ends_at &&
    new Date(currentClinic.trial_ends_at) <= new Date() &&
    currentClinic?.subscription_status !== 'free';
  
  if (trialJustExpired) {
    logStep("Complimentary trial expired - no Stripe subscription found, setting to free", {
      expiredAt: currentClinic.trial_ends_at
    });
    updates.subscription_status = 'free';
    updates.subscription_tier = 'basic';
    updates.consults_cap = 50;
  } else {
    logStep("No active subscription to sync");
  }
}

    // Update clinics
    const { error: updateErr } = await supabaseClient
      .from('clinics')
      .update(updates)
      .eq('id', clinicId);

    if (updateErr) throw new Error(`Failed to update clinic: ${updateErr.message}`);

    return new Response(JSON.stringify({ updated: true, ...updates }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in sync-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});