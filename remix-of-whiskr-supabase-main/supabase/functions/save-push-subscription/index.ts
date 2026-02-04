import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { subscription, userId, clinicId } = await req.json();
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Enforce per-account-per-device by endpoint
    const endpoint: string | undefined = subscription?.endpoint;
    if (!endpoint) {
      throw new Error("Invalid subscription: missing endpoint");
    }

    // Remove any existing records for this endpoint tied to other users
    await supabaseClient
      .from('push_subscriptions')
      .delete()
      .neq('user_id', userId)
      .eq('subscription->>endpoint', endpoint);

    // Check if this user already has ANY subscription (regardless of endpoint)
    const { data: existingRows, error: existingErr } = await supabaseClient
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (existingErr) throw existingErr;

    let error = null;
    if (existingRows && existingRows.length > 0) {
      // Update the existing subscription with the new endpoint
      const { error: updateErr } = await supabaseClient
        .from('push_subscriptions')
        .update({
          clinic_id: clinicId,
          subscription: subscription,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRows[0].id);
      error = updateErr;
    } else {
      const { error: insertErr } = await supabaseClient
        .from('push_subscriptions')
        .insert({
          user_id: userId,
          clinic_id: clinicId,
          subscription: subscription,
        });
      error = insertErr;
    }

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Error saving push subscription:", error);
    return new Response(JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
