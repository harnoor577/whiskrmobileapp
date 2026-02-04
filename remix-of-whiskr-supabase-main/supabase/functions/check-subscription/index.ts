import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
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
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    logStep("Authenticating user with token");
    
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) {
      logStep("Authentication failed - session expired or invalid", { error: userError?.message });
      return new Response(JSON.stringify({ 
        subscribed: false,
        error: "Session expired or invalid",
        requiresReauth: true
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    const user = userData.user;
    if (!user?.email) {
      logStep("User email not available");
      return new Response(JSON.stringify({ 
        subscribed: false,
        error: "User email not available",
        requiresReauth: true
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Parse request body for optional clinicId (for super admin viewing other accounts)
    const body = await req.json().catch(() => ({}));
    const requestedClinicId = body.clinicId;
    
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    
    let customerId: string | null = null;
    let clinicId: string | null = requestedClinicId;
    
    // If clinicId is provided, use the clinic's stripe_customer_id
    if (clinicId) {
      logStep("Using clinicId to lookup stripe_customer_id", { clinicId });
      const { data: clinic, error: clinicError } = await supabaseClient
        .from('clinics')
        .select('stripe_customer_id, complimentary_trial_granted, trial_ends_at, subscription_tier')
        .eq('id', clinicId)
        .single();
      
      if (clinicError) {
        logStep("Clinic lookup failed", { error: clinicError.message });
      } else {
        if (clinic?.stripe_customer_id) {
          customerId = clinic.stripe_customer_id;
          logStep("Found stripe_customer_id from clinic", { customerId });
        }
        
        // Check for active complimentary trial
        const hasActiveComplimentaryTrial = 
          clinic?.complimentary_trial_granted === true &&
          clinic?.trial_ends_at &&
          new Date(clinic.trial_ends_at) > new Date();
        
        // Check Stripe subscriptions if we have a customer ID
        if (customerId) {
          let subscriptions;
          try {
            subscriptions = await stripe.subscriptions.list({
              customer: customerId,
              limit: 10,
            });
          } catch (stripeError: any) {
            logStep("Stripe API error during subscription lookup", { error: stripeError.message });
            subscriptions = { data: [] };
          }

          const selectable = subscriptions.data.find((s: any) => s.status === 'active' || s.status === 'trialing');
          
          // If there's an active Stripe subscription, use it (HIGHEST PRIORITY)
          if (selectable) {
            const subscriptionEnd = selectable.current_period_end 
              ? new Date(selectable.current_period_end * 1000).toISOString()
              : null;
            const subscriptionStatus = selectable.status;
            const cancelAtPeriodEnd = selectable.cancel_at_period_end || false;
            const productId = selectable.items.data[0].price.product as string;
            
            logStep("Active Stripe subscription found via clinicId lookup", { 
              subscriptionId: selectable.id, 
              status: subscriptionStatus, 
              cancelAtPeriodEnd, 
              endDate: subscriptionEnd,
              hasComplimentaryTrial: hasActiveComplimentaryTrial
            });
            
            return new Response(JSON.stringify({
              subscribed: true,
              product_id: productId,
              subscription_end: subscriptionEnd,
              subscription_status: subscriptionStatus,
              cancel_at_period_end: cancelAtPeriodEnd
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            });
          }
        }
        
        // No active Stripe subscription - fall back to complimentary trial if available
        if (hasActiveComplimentaryTrial) {
          logStep("No active Stripe subscription - using complimentary trial data", {
            trialEndsAt: clinic.trial_ends_at,
            tier: clinic.subscription_tier
          });
          
          return new Response(JSON.stringify({
            subscribed: true,
            product_id: 'complimentary_trial',
            subscription_tier: clinic.subscription_tier,
            subscription_end: clinic.trial_ends_at,
            subscription_status: 'trial',
            is_complimentary: true,
            cancel_at_period_end: false
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }
        
        // No subscription or trial found for this clinic
        logStep("No active subscription found for clinic", { clinicId });
        return new Response(JSON.stringify({
          subscribed: false,
          product_id: null,
          subscription_end: null,
          subscription_status: null,
          cancel_at_period_end: false
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }
    
    // No clinicId provided - fall back to user email lookup
    let customers;
    try {
      customers = await stripe.customers.list({ email: user.email, limit: 1 });
    } catch (stripeError: any) {
      logStep("Stripe API error during customer lookup", { error: stripeError.message });
      return new Response(JSON.stringify({ 
        subscribed: false,
        error: "Unable to verify subscription status" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    
    if (customers.data.length === 0) {
      logStep("No customer found via list; attempting search API");
      try {
        const search = await stripe.customers.search({ query: `email:\"${user.email}\"`, limit: 1 });
        if (search.data.length === 0) {
          logStep("No customer found after search; returning unsubscribed");
          return new Response(JSON.stringify({ subscribed: false }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }
        customers = search;
      } catch (searchError: any) {
        logStep("Stripe customer search error", { error: searchError.message });
        return new Response(JSON.stringify({ subscribed: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    customerId = customers.data[0].id;
    logStep("Found Stripe customer by email", { customerId });

    // Get clinic data for complimentary trial check (user's default clinic)
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('clinic_id')
      .eq('user_id', user.id)
      .single();
    
    let clinicData: any = null;
    if (profile?.clinic_id) {
      const { data } = await supabaseClient
        .from('clinics')
        .select('complimentary_trial_granted, trial_ends_at, subscription_tier')
        .eq('id', profile.clinic_id)
        .single();
      clinicData = data;
    }
    
    const hasActiveComplimentaryTrial = 
      clinicData?.complimentary_trial_granted === true &&
      clinicData?.trial_ends_at &&
      new Date(clinicData.trial_ends_at) > new Date();

    // FIRST check for active Stripe subscription (HIGHEST PRIORITY)
    // Active paid subscriptions always take precedence over complimentary trials

    // Check Stripe subscriptions FIRST (paid subscriptions take priority)
    let subscriptions;
    try {
      subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 10,
      });
    } catch (stripeError: any) {
      logStep("Stripe API error during subscription lookup", { error: stripeError.message });
      return new Response(JSON.stringify({ 
        subscribed: false,
        error: "Unable to verify subscription status" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const selectable = subscriptions.data.find((s: any) => s.status === 'active' || s.status === 'trialing');
    
    // If there's an active Stripe subscription, use it (HIGHEST PRIORITY)
    if (selectable) {
      const subscriptionEnd = selectable.current_period_end 
        ? new Date(selectable.current_period_end * 1000).toISOString()
        : null;
      const subscriptionStatus = selectable.status;
      const cancelAtPeriodEnd = selectable.cancel_at_period_end || false;
      const productId = selectable.items.data[0].price.product as string;
      
      logStep("Active Stripe subscription found - using Stripe data (priority over complimentary trial)", { 
        subscriptionId: selectable.id, 
        status: subscriptionStatus, 
        cancelAtPeriodEnd, 
        endDate: subscriptionEnd,
        hasComplimentaryTrial: hasActiveComplimentaryTrial
      });
      
      return new Response(JSON.stringify({
        subscribed: true,
        product_id: productId,
        subscription_end: subscriptionEnd,
        subscription_status: subscriptionStatus,
        cancel_at_period_end: cancelAtPeriodEnd
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    
    // No active Stripe subscription - fall back to complimentary trial if available
    if (hasActiveComplimentaryTrial) {
      logStep("No active Stripe subscription - using complimentary trial data", {
        trialEndsAt: clinicData.trial_ends_at,
        tier: clinicData.subscription_tier
      });
      
      return new Response(JSON.stringify({
        subscribed: true,
        product_id: 'complimentary_trial',
        subscription_tier: clinicData.subscription_tier,
        subscription_end: clinicData.trial_ends_at,
        subscription_status: 'trial',
        is_complimentary: true,
        cancel_at_period_end: false
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    
    // No active subscription or complimentary trial
    logStep("No active subscription found", { 
      stripeStatuses: subscriptions.data.map((s: any) => s.status),
      hasComplimentaryTrial: hasActiveComplimentaryTrial
    });

    return new Response(JSON.stringify({
      subscribed: false,
      product_id: null,
      subscription_end: null,
      subscription_status: null,
      cancel_at_period_end: false
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error in check-subscription:", error);
    logStep("ERROR in check-subscription", { message: error instanceof Error ? error.message : 'Unknown error' });
    return new Response(JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
