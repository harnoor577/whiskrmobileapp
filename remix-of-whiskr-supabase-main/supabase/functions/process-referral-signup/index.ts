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
    const { referralCode, newUserId } = await req.json();

    if (!referralCode || !newUserId) {
      throw new Error("Missing required parameters");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Find the referral code and referrer
    const { data: referralCodeData, error: codeError } = await supabaseClient
      .from("referral_codes")
      .select("user_id, inviter_name")
      .eq("code", referralCode.toUpperCase())
      .single();

    if (codeError || !referralCodeData) {
      throw new Error("Invalid referral code");
    }

    // Create referral record
    const { error: referralError } = await supabaseClient
      .from("referrals")
      .insert({
        referrer_id: referralCodeData.user_id,
        referred_user_id: newUserId,
        referral_code: referralCode.toUpperCase(),
        inviter_name: referralCodeData.inviter_name
      });

    if (referralError) {
      console.error("Referral insert error:", referralError);
      throw referralError;
    }

    // Increment uses count - first fetch current count
    const { data: currentCode } = await supabaseClient
      .from("referral_codes")
      .select("uses_count")
      .eq("code", referralCode.toUpperCase())
      .single();

    if (currentCode) {
      await supabaseClient
        .from("referral_codes")
        .update({ uses_count: (currentCode.uses_count || 0) + 1 })
        .eq("code", referralCode.toUpperCase());
    }

    console.log("Referral processed successfully");

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});