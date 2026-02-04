import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[LIST-PAYMENTS] ${step}${detailsStr}`);
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

    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Parse request body for optional clinicId
    const body = await req.json().catch(() => ({}));
    const clinicId = body.clinicId;
    
    let customerId: string | null = null;
    
    // If clinicId is provided, use the clinic's stripe_customer_id (for super admin viewing other accounts)
    if (clinicId) {
      logStep("Using clinicId to lookup stripe_customer_id", { clinicId });
      const { data: clinic, error: clinicError } = await supabaseClient
        .from('clinics')
        .select('stripe_customer_id')
        .eq('id', clinicId)
        .single();
      
      if (clinicError) {
        logStep("Clinic lookup failed", { error: clinicError.message });
      } else if (clinic?.stripe_customer_id) {
        customerId = clinic.stripe_customer_id;
        logStep("Found stripe_customer_id from clinic", { customerId });
      }
    }
    
    // If no customerId from clinic, fall back to looking up by user email
    if (!customerId && user.email) {
      // Locate Stripe customer by email
      let customers;
      try {
        customers = await stripe.customers.list({ email: user.email, limit: 1 });
        if (customers.data.length === 0) {
          const search = await stripe.customers.search({ query: `email:\"${user.email}\"`, limit: 1 });
          customers = search;
        }
      } catch (e: any) {
        logStep("Stripe customer lookup failed", { error: e.message });
        return new Response(JSON.stringify({ invoices: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
      }
      
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      }
    }

    if (!customerId) {
      logStep("No Stripe customer found; searching invoices by customer_email");
      try {
        const invSearch = await stripe.invoices.search({
          query: `customer_email:\"${user.email}\"`,
          limit: 10,
        });
        if (invSearch.data.length === 0) {
          logStep("No invoices found for this email");
          return new Response(JSON.stringify({ invoices: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
        }
        // Retrieve each invoice with expansions for consistent shape
        const expanded = [] as any[];
        for (const inv of invSearch.data) {
          try {
            const full = await stripe.invoices.retrieve(inv.id, {
              expand: [
                "payment_intent.payment_method",
                "default_payment_method",
                "lines.data.price",
              ],
            });
            expanded.push(full);
          } catch (_) {
            expanded.push(inv);
          }
        }
        const result = expanded.map((inv: any) => {
          let pm = inv?.payment_intent?.payment_method || inv?.default_payment_method;
          let pmSummary = '';
          if (pm?.card) pmSummary = `${pm.card.brand?.toUpperCase() || 'CARD'} •••• ${pm.card.last4}`;
          else if (pm?.type) pmSummary = pm.type.toUpperCase();
           const firstLine = inv.lines?.data?.[0];
           const planName = firstLine?.price?.nickname || firstLine?.description || null;
           const coupon = inv.discount?.coupon?.name || inv.discount?.coupon?.id || null;
          return {
            id: inv.id,
            status: inv.status,
            amount_paid: inv.amount_paid,
            currency: inv.currency,
            created: inv.created,
            hosted_invoice_url: inv.hosted_invoice_url,
            invoice_pdf: inv.invoice_pdf,
            plan_name: planName,
            coupon,
            payment_method: pmSummary,
          };
        });
        return new Response(JSON.stringify({ invoices: result, default_payment_method_summary: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
      } catch (e: any) {
        logStep("Invoice search failed", { error: e.message });
        return new Response(JSON.stringify({ invoices: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
      }
    }

    logStep("Using customer", { customerId });

// Retrieve customer's default payment method
let defaultPmSummary = '';
try {
  const customer = await stripe.customers.retrieve(customerId, { expand: ['invoice_settings.default_payment_method'] }) as any;
  const dpm = customer?.invoice_settings?.default_payment_method;
  if (dpm?.card) defaultPmSummary = `${dpm.card.brand?.toUpperCase() || 'CARD'} •••• ${dpm.card.last4}`;
  else if (dpm?.type) defaultPmSummary = dpm.type.toUpperCase();
} catch (_) {}

// List recent invoices and expand useful relations
const invoices = await stripe.invoices.list({
  customer: customerId,
  limit: 20,
  expand: [
    "data.payment_intent.payment_method",
    "data.default_payment_method",
    "data.lines.data.price",
  ],
});

    const result = invoices.data.map((inv: any) => {
      // Payment method summary
      let pm = inv?.payment_intent?.payment_method || inv?.default_payment_method;
      let pmSummary = '';
      if (pm?.card) {
        pmSummary = `${pm.card.brand?.toUpperCase() || 'CARD'} •••• ${pm.card.last4}`;
      } else if (pm?.type) {
        pmSummary = pm.type.toUpperCase();
      }

      // Plan/product info (first line item)
      const firstLine = inv.lines?.data?.[0];
      const planName = firstLine?.price?.nickname || firstLine?.description || null;

      // Coupon / discount
      const coupon = inv.discount?.coupon?.name || inv.discount?.coupon?.id || null;

      return {
        id: inv.id,
        status: inv.status,
        amount_paid: inv.amount_paid,
        currency: inv.currency,
        created: inv.created,
        hosted_invoice_url: inv.hosted_invoice_url,
        invoice_pdf: inv.invoice_pdf,
        plan_name: planName,
        coupon,
        payment_method: pmSummary,
      };
    });

return new Response(JSON.stringify({ invoices: result, default_payment_method_summary: defaultPmSummary }), {
  headers: { ...corsHeaders, "Content-Type": "application/json" },
  status: 200,
});
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in list-payments", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});