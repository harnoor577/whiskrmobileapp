import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

// Complete product-to-tier mapping
const PRODUCT_TO_TIER: Record<string, string> = {
  'prod_TMsaAINJaRiZ2w': 'basic',        // Basic $49/mo (original)
  'prod_TMsb4wwa7X3SyE': 'professional', // Professional $97/mo (original)
  'prod_TYBSeDmTOYk1bB': 'professional', // Professional (new price)
  'prod_TYBSham4XJYaXq': 'basic',        // Standard plan
  'prod_TYBSqzDnYP43Ow': 'enterprise',   // Premium/Enterprise plan
};

// Tier consult caps
const TIER_CAPS: Record<string, number> = {
  'basic': 100,
  'professional': 200,
  'enterprise': 999999, // Unlimited
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
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    
    // Get the webhook signature
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      throw new Error("No stripe-signature header found");
    }

    // Get the raw body
    const body = await req.text();
    
    // Verify webhook signature (if webhook secret is configured)
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    let event: Stripe.Event;
    
    if (webhookSecret) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
        logStep("Webhook signature verified");
      } catch (err: any) {
        logStep("Webhook signature verification failed", { error: err.message });
        return new Response(
          JSON.stringify({ error: "Webhook signature verification failed" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }
    } else {
      // No webhook secret configured, parse body directly (not recommended for production)
      event = JSON.parse(body);
      logStep("No webhook secret configured, processing without verification");
    }

    logStep("Processing event", { type: event.type, id: event.id });

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        // Fires when a checkout session is successfully completed
        const session = event.data.object as Stripe.Checkout.Session;
        
        logStep("Checkout session completed", { 
          sessionId: session.id,
          customerId: session.customer,
          subscriptionId: session.subscription,
          customerEmail: session.customer_email || session.customer_details?.email
        });
        
        if (session.mode === 'subscription' && session.subscription) {
          const subscriptionId = typeof session.subscription === 'string' 
            ? session.subscription 
            : session.subscription.id;
          
          // Retrieve full subscription details
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const productId = subscription.items.data[0]?.price?.product as string;
          const tier = PRODUCT_TO_TIER[productId] || 'basic';
          const customerEmail = session.customer_email || session.customer_details?.email;
          
          logStep("New subscription created via checkout", { 
            subscriptionId, 
            productId, 
            tier,
            customerEmail 
          });
          
          // Find clinic by email
          if (customerEmail) {
            const { data: profile } = await supabaseClient
              .from('profiles')
              .select('clinic_id')
              .eq('email', customerEmail)
              .limit(1)
              .single();
            
            if (profile?.clinic_id) {
              const billingCycleStart = new Date(subscription.current_period_start * 1000)
                .toISOString()
                .split('T')[0];
              
              const { error: updateError } = await supabaseClient
                .from('clinics')
                .update({
                  stripe_customer_id: session.customer as string,
                  stripe_subscription_id: subscriptionId,
                  subscription_status: 'active',
                  subscription_tier: tier,
                  consults_cap: TIER_CAPS[tier] || 100,
                  consults_used_this_period: 0,
                  billing_cycle_start_date: billingCycleStart,
                  notification_80_sent: false,
                  notification_95_sent: false,
                })
                .eq('id', profile.clinic_id);
              
              if (updateError) {
                logStep("Error updating clinic after checkout", { error: updateError.message });
              } else {
                logStep("Clinic updated successfully after checkout", { 
                  clinicId: profile.clinic_id, 
                  tier 
                });
              }
              
              // Log audit event
              await supabaseClient
                .from('audit_events')
                .insert({
                  clinic_id: profile.clinic_id,
                  action: 'subscription_created',
                  entity_type: 'subscription',
                  entity_id: subscriptionId,
                  details: {
                    tier,
                    product_id: productId,
                    checkout_session_id: session.id,
                    event_id: event.id,
                  },
                });
            } else {
              logStep("No profile found for customer email", { customerEmail });
            }
          }
        }
        break;
      }

      case 'customer.subscription.created': {
        // Fires when a new subscription is created (can be from checkout or API)
        const subscription = event.data.object as Stripe.Subscription;
        
        logStep("Subscription created", { 
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status
        });
        
        // Only process active/trialing subscriptions
        if (subscription.status === 'active' || subscription.status === 'trialing') {
          const productId = subscription.items.data[0]?.price?.product as string;
          const tier = PRODUCT_TO_TIER[productId] || 'basic';
          const customerId = typeof subscription.customer === 'string' 
            ? subscription.customer 
            : subscription.customer?.id;
          
          // Find clinic by stripe_customer_id
          const { data: clinic } = await supabaseClient
            .from('clinics')
            .select('id, subscription_tier')
            .eq('stripe_customer_id', customerId)
            .single();
          
          if (clinic) {
            const billingCycleStart = new Date(subscription.current_period_start * 1000)
              .toISOString()
              .split('T')[0];
            
            const { error: updateError } = await supabaseClient
              .from('clinics')
              .update({
                stripe_subscription_id: subscription.id,
                subscription_status: 'active',
                subscription_tier: tier,
                consults_cap: TIER_CAPS[tier] || 100,
                consults_used_this_period: 0,
                billing_cycle_start_date: billingCycleStart,
                notification_80_sent: false,
                notification_95_sent: false,
              })
              .eq('id', clinic.id);
            
            if (updateError) {
              logStep("Error updating clinic on subscription created", { error: updateError.message });
            } else {
              logStep("Clinic updated on new subscription", { clinicId: clinic.id, tier });
            }
          }
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        // This fires when a subscription is renewed/rebilled
        const invoice = event.data.object as Stripe.Invoice;
        
        logStep("Invoice payment succeeded", {
          invoiceId: invoice.id,
          subscriptionId: invoice.subscription,
          customerId: invoice.customer,
          billingReason: invoice.billing_reason
        });
        
        if (invoice.subscription && invoice.billing_reason === 'subscription_cycle') {
          logStep("Subscription renewal detected (subscription_cycle)", { 
            subscriptionId: invoice.subscription,
            customerId: invoice.customer 
          });
          
          // Get subscription details
          const subscription = await stripe.subscriptions.retrieve(
            invoice.subscription as string
          );
          
          // Get billing cycle start from Stripe's current period
          const billingCycleStart = new Date(subscription.current_period_start * 1000)
            .toISOString()
            .split('T')[0];
          
          // First try to find clinic by stripe_subscription_id
          let clinic = await supabaseClient
            .from('clinics')
            .select('id')
            .eq('stripe_subscription_id', subscription.id)
            .single();
          
          // If not found, try to find by stripe_customer_id
          if (!clinic.data) {
            const customerId = typeof invoice.customer === 'string' 
              ? invoice.customer 
              : invoice.customer?.id;
            
            if (customerId) {
              clinic = await supabaseClient
                .from('clinics')
                .select('id')
                .eq('stripe_customer_id', customerId)
                .single();
            }
          }
          
          if (clinic.data) {
            // Directly update the clinic to reset consults, billing cycle, and clear payment_failed_at
            const { error: updateError } = await supabaseClient
              .from('clinics')
              .update({
                consults_used_this_period: 0,
                notification_80_sent: false,
                notification_95_sent: false,
                billing_cycle_start_date: billingCycleStart,
                stripe_subscription_id: subscription.id, // Ensure this is synced
                subscription_status: 'active', // Payment succeeded, ensure status is active
                payment_failed_at: null, // Clear any payment failure tracking
              })
              .eq('id', clinic.data.id);
            
            if (updateError) {
              logStep("Error resetting consults via direct update", { error: updateError.message });
            } else {
              logStep("Consults reset and payment_failed_at cleared for clinic", { 
                clinicId: clinic.data.id,
                billingCycleStart,
                subscriptionId: subscription.id 
              });
            }
            
            // Log audit event
            await supabaseClient
              .from('audit_events')
              .insert({
                clinic_id: clinic.data.id,
                action: 'billing_cycle_reset',
                entity_type: 'subscription',
                entity_id: subscription.id,
                details: {
                  billing_cycle_start: billingCycleStart,
                  invoice_id: invoice.id,
                  billing_reason: invoice.billing_reason,
                  event_id: event.id,
                },
              });
          } else {
            // Fall back to RPC function
            const { error: resetError } = await supabaseClient.rpc(
              'reset_consults_on_rebilling',
              {
                p_stripe_subscription_id: subscription.id,
                p_billing_cycle_start: billingCycleStart,
              }
            );
            
            if (resetError) {
              logStep("Error resetting consults via RPC", { error: resetError.message });
            } else {
              logStep("Consults reset successfully via RPC", { 
                subscriptionId: subscription.id 
              });
            }
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        // Fires when a payment fails
        const invoice = event.data.object as Stripe.Invoice;
        
        logStep("Payment failed", { 
          invoiceId: invoice.id,
          subscriptionId: invoice.subscription,
          customerId: invoice.customer,
          attemptCount: invoice.attempt_count,
          nextPaymentAttempt: invoice.next_payment_attempt
        });
        
        // Find clinic and track the failure
        if (invoice.subscription) {
          const { data: clinic } = await supabaseClient
            .from('clinics')
            .select('id, payment_failed_at, subscription_status')
            .eq('stripe_subscription_id', invoice.subscription as string)
            .single();
          
          if (clinic) {
            // Set payment_failed_at only on first failure (start of grace period)
            const isFirstFailure = !clinic.payment_failed_at;
            
            const { error: updateError } = await supabaseClient
              .from('clinics')
              .update({
                payment_failed_at: isFirstFailure ? new Date().toISOString() : clinic.payment_failed_at,
                subscription_status: 'past_due', // Mark as past_due on any payment failure
              })
              .eq('id', clinic.id);
            
            if (updateError) {
              logStep("Error updating payment_failed_at", { error: updateError.message });
            } else {
              logStep("Clinic marked as past_due", { 
                clinicId: clinic.id, 
                isFirstFailure,
                attemptCount: invoice.attempt_count 
              });
            }
            
            // Find admin(s) to notify
            const { data: admins } = await supabaseClient
              .from('profiles')
              .select('user_id, name')
              .eq('clinic_id', clinic.id);
            
            const { data: adminRoles } = await supabaseClient
              .from('user_roles')
              .select('user_id')
              .eq('role', 'admin');
            
            const adminUserIds = adminRoles?.map(r => r.user_id) || [];
            
            // Create in-app notification for each admin
            for (const admin of admins || []) {
              if (adminUserIds.includes(admin.user_id)) {
                await supabaseClient
                  .from('notifications')
                  .insert({
                    clinic_id: clinic.id,
                    user_id: admin.user_id,
                    title: 'Payment Failed',
                    description: `Your payment failed. Please update your payment method within 7 days to avoid service interruption.`,
                    type: 'billing',
                    priority: 'high',
                    action_url: '/billing',
                  });
              }
            }
            
            // Log audit event for payment failure
            await supabaseClient
              .from('audit_events')
              .insert({
                clinic_id: clinic.id,
                action: 'payment_failed',
                entity_type: 'invoice',
                entity_id: invoice.id,
                details: {
                  subscription_id: invoice.subscription,
                  attempt_count: invoice.attempt_count,
                  amount_due: invoice.amount_due,
                  currency: invoice.currency,
                  is_first_failure: isFirstFailure,
                  grace_period_started: isFirstFailure ? new Date().toISOString() : clinic.payment_failed_at,
                  event_id: event.id,
                },
              });
            
            logStep("Payment failure processed", { 
              clinicId: clinic.id, 
              isFirstFailure,
              notificationsCreated: adminUserIds.length 
            });
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        // This fires when a subscription is upgraded/downgraded or status changes
        const subscription = event.data.object as Stripe.Subscription;
        
        logStep("Subscription updated", { 
          subscriptionId: subscription.id,
          status: subscription.status 
        });
        
        // Find the clinic with this subscription
        const { data: clinic } = await supabaseClient
          .from('clinics')
          .select('id, subscription_tier, consults_used_this_period')
          .eq('stripe_subscription_id', subscription.id)
          .single();
        
        if (clinic) {
          // Map product to tier
          const productId = subscription.items.data[0]?.price?.product as string;
          const newTier = PRODUCT_TO_TIER[productId];
          
          if (newTier && clinic.subscription_tier !== newTier) {
            logStep("Plan change detected", { 
              oldTier: clinic.subscription_tier, 
              newTier 
            });
            
            // Get new billing cycle start date from Stripe subscription
            const billingCycleStart = new Date(subscription.current_period_start * 1000)
              .toISOString()
              .split('T')[0];
            
            // Update clinic with new tier, reset consults, and update billing cycle start
            const { error: updateError } = await supabaseClient
              .from('clinics')
              .update({
                subscription_tier: newTier,
                subscription_status: subscription.status === 'active' ? 'active' : subscription.status,
                consults_cap: TIER_CAPS[newTier] || 100,
                consults_used_this_period: 0,
                billing_cycle_start_date: billingCycleStart, // Reset billing cycle on upgrade
                notification_80_sent: false,
                notification_95_sent: false,
              })
              .eq('id', clinic.id);
            
            if (updateError) {
              logStep("Error updating clinic tier", { error: updateError.message });
            } else {
              logStep("Clinic tier updated successfully", { clinicId: clinic.id, newTier });
            }
            
            // Log audit event
            await supabaseClient
              .from('audit_events')
              .insert({
                clinic_id: clinic.id,
                action: 'plan_change',
                entity_type: 'subscription',
                entity_id: subscription.id,
                details: {
                  old_tier: clinic.subscription_tier,
                  new_tier: newTier,
                  product_id: productId,
                  webhook_event: event.type,
                  event_id: event.id,
                },
              });
          } else if (subscription.status !== 'active' && subscription.status !== 'trialing') {
            // Handle status changes (e.g., past_due, unpaid)
            logStep("Subscription status changed", { 
              clinicId: clinic.id,
              newStatus: subscription.status 
            });
            
            await supabaseClient
              .from('clinics')
              .update({
                subscription_status: subscription.status,
              })
              .eq('id', clinic.id);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        // Subscription cancelled
        const subscription = event.data.object as Stripe.Subscription;
        
        logStep("Subscription cancelled", { subscriptionId: subscription.id });
        
        // Update clinic to free tier
        const { error: updateError } = await supabaseClient
          .from('clinics')
          .update({
            subscription_status: 'cancelled',
            subscription_tier: 'free',
            consults_cap: 50,
          })
          .eq('stripe_subscription_id', subscription.id);
        
        if (updateError) {
          logStep("Error updating cancelled subscription", { error: updateError.message });
        } else {
          logStep("Clinic updated to free tier after cancellation");
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(
      JSON.stringify({ received: true, eventType: event.type }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    // Log full error details server-side only
    logStep("ERROR", { message: error.message, stack: error.stack });
    // Return generic error to client to prevent information leakage
    return new Response(
      JSON.stringify({ error: 'An error occurred processing the webhook' }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
