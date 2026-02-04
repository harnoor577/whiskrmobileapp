import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[PROCESS-STRIPE-REFUND] ${step}${detailsStr}`);
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
    logStep("User authenticated", { userId: user.id });

    // Verify user is super admin
    const { data: isSuperAdmin } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .maybeSingle();

    if (!isSuperAdmin) throw new Error("Unauthorized: Only super admins can process refunds");

    const { ticketId } = await req.json();
    if (!ticketId) throw new Error("ticketId is required");

    logStep("Processing refund for ticket", { ticketId });

    // Get ticket details
    const { data: ticket, error: ticketError } = await supabaseClient
      .from('support_tickets')
      .select('*, payload')
      .eq('id', ticketId)
      .maybeSingle();

    if (ticketError) throw new Error(`Database error: ${ticketError.message}`);
    if (!ticket) throw new Error(`No ticket found with ID: ${ticketId}`);
    if (ticket.category !== 'billing_refund') throw new Error('Ticket is not a refund request');

    logStep("Ticket loaded", { category: ticket.category, payload: ticket.payload });

    // Get user profile for email
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('email')
      .eq('user_id', ticket.user_id)
      .maybeSingle();

    if (!profile?.email) throw new Error('User email not found');

    // Find customer in Stripe
    const customers = await stripe.customers.list({ email: profile.email, limit: 1 });
    if (customers.data.length === 0) {
      throw new Error('No Stripe customer found for this user');
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    // Get the invoice ID from the ticket payload
    const invoiceId = ticket.payload?.invoice;
    if (!invoiceId) throw new Error('No invoice ID found in refund request');

    // Retrieve the invoice to get the payment intent or charge
    let invoice;
    try {
      invoice = await stripe.invoices.retrieve(invoiceId);
    } catch (e: any) {
      throw new Error(`Failed to retrieve invoice: ${e.message}`);
    }

    logStep("Invoice retrieved", { 
      invoiceId,
      hasPaymentIntent: !!invoice.payment_intent,
      hasCharge: !!invoice.charge,
      status: invoice.status 
    });

    // Try to get payment intent, fallback to charge
    let paymentIntentId: string | null = null;
    let chargeId: string | null = null;

    if (invoice.payment_intent) {
      paymentIntentId = typeof invoice.payment_intent === 'string' 
        ? invoice.payment_intent 
        : invoice.payment_intent.id;
      logStep("Found payment intent", { paymentIntentId });
    } else if (invoice.charge) {
      chargeId = typeof invoice.charge === 'string'
        ? invoice.charge
        : invoice.charge.id;
      logStep("Found charge (no payment intent)", { chargeId });
    } else {
      throw new Error('Invoice has no payment intent or charge. Cannot process refund.');
    }

    // Determine refund amount
    const requestedAmount = ticket.payload?.amount;
    const refundType = ticket.payload?.refund_type;
    let refundAmountCents: number | undefined;

    if (refundType === 'partial' && requestedAmount) {
      // Convert dollars to cents
      refundAmountCents = Math.round(requestedAmount * 100);
    } else if (refundType === 'full') {
      // Full refund - let Stripe determine the amount
      refundAmountCents = undefined;
    } else if (refundType === 'prorated') {
      // For prorated, we'll use the requested amount
      refundAmountCents = requestedAmount ? Math.round(requestedAmount * 100) : undefined;
    }

    logStep("Refund amount determined", { refundAmountCents, refundType });

    // Create the refund in Stripe (use payment_intent if available, otherwise charge)
    const refundParams: any = {
      amount: refundAmountCents,
      reason: 'requested_by_customer',
      metadata: {
        ticket_id: ticketId,
        processed_by: user.id,
      },
    };

    if (paymentIntentId) {
      refundParams.payment_intent = paymentIntentId;
    } else if (chargeId) {
      refundParams.charge = chargeId;
    }

    const refund = await stripe.refunds.create(refundParams);

    logStep("Refund created in Stripe", { 
      refundId: refund.id, 
      amount: refund.amount,
      status: refund.status 
    });

    // Update ticket with refund transaction details
    const refundMetadata = {
      stripe_refund_id: refund.id,
      stripe_payment_intent_id: paymentIntentId || undefined,
      stripe_charge_id: chargeId || undefined,
      refund_amount_cents: refund.amount,
      refund_currency: refund.currency,
      refund_status: refund.status,
      processed_at: new Date().toISOString(),
      processed_by: user.id,
    };

    const { error: updateError } = await supabaseClient
      .from('support_tickets')
      .update({
        refund_status: 'processed',
        payload: {
          ...ticket.payload,
          refund_metadata: refundMetadata,
        },
      })
      .eq('id', ticketId);

    if (updateError) {
      logStep("Warning: Failed to update ticket", { error: updateError.message });
    }

    // Send email notification about processed refund
    try {
      await supabaseClient.functions.invoke('send-refund-status-email', {
        body: { ticketId, newStatus: 'processed' },
      });
    } catch (emailError: any) {
      logStep("Warning: Failed to send email", { error: emailError.message });
    }

    return new Response(JSON.stringify({
      success: true,
      refund: {
        id: refund.id,
        amount: refund.amount / 100, // Convert back to dollars
        currency: refund.currency.toUpperCase(),
        status: refund.status,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in process-stripe-refund", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
