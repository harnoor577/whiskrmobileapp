import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");

    const { data: userData } = await supabaseClient.auth.getUser(token);
    const user = userData.user;
    if (!user) throw new Error("Unauthorized");

    // Ensure user is super admin (by role only - no hardcoded emails)
    let isSuperAdmin = false;
    try {
      const { data: roles } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      isSuperAdmin = !!roles?.some((r: any) => r.role === 'super_admin');
    } catch (_) {}

    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: super_admin role required' }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    const body = await req.json();
    const payment_intent: string = body.payment_intent;
    const amount_dollars: number | undefined = body.amount_dollars; // optional
    const reason: 'duplicate' | 'fraudulent' | 'requested_by_customer' | undefined = body.reason;

    if (!payment_intent) throw new Error('payment_intent is required');

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2024-11-20.acacia' });

    const refund = await stripe.refunds.create({
      payment_intent,
      amount: typeof amount_dollars === 'number' ? Math.round(amount_dollars * 100) : undefined,
      reason,
    });

    return new Response(JSON.stringify({ id: refund.id, status: refund.status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});