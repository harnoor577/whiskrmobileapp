import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_LIFETIME_CREDIT = 2500;
const CREDIT_PER_REFERRAL = 50;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { referralId, referrerId } = await req.json();

    if (!referralId || !referrerId) {
      throw new Error("Missing required parameters");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check if credit already awarded
    const { data: referral } = await supabaseClient
      .from("referrals")
      .select("credit_awarded")
      .eq("id", referralId)
      .maybeSingle();

    if (referral?.credit_awarded) {
      return new Response(
        JSON.stringify({ message: "Credit already awarded" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check current lifetime total
    const { data: totalCredits } = await supabaseClient
      .rpc("get_user_total_credits", { user_uuid: referrerId });

    const currentTotal = Number(totalCredits || 0);

    if (currentTotal >= MAX_LIFETIME_CREDIT) {
      console.log(`User ${referrerId} has reached max credit limit`);
      return new Response(
        JSON.stringify({ 
          message: "Maximum lifetime credit reached",
          current_total: currentTotal,
          max_limit: MAX_LIFETIME_CREDIT
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate credit amount (don't exceed max)
    const creditAmount = Math.min(
      CREDIT_PER_REFERRAL,
      MAX_LIFETIME_CREDIT - currentTotal
    );

    // Award credit
    const { error: creditError } = await supabaseClient
      .from("user_credits")
      .insert({
        user_id: referrerId,
        amount: creditAmount,
        source: "referral",
        referral_id: referralId,
      });

    if (creditError) throw creditError;

    // Mark referral as credited
    const { error: updateError } = await supabaseClient
      .from("referrals")
      .update({ 
        credit_awarded: true,
        became_paying_at: new Date().toISOString()
      })
      .eq("id", referralId);

    if (updateError) throw updateError;

    console.log(`Awarded $${creditAmount} credit to user ${referrerId}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        amount: creditAmount,
        new_total: currentTotal + creditAmount
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});