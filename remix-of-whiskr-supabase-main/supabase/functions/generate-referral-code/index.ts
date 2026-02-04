import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Check if user already has a referral code
    const { data: existingCode } = await supabaseClient
      .from("referral_codes")
      .select("code")
      .eq("user_id", user.id)
      .single();

    if (existingCode) {
      return new Response(
        JSON.stringify({ code: existingCode.code }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user profile to extract name
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("name")
      .eq("user_id", user.id)
      .single();

    let userName = profile?.name;
    
    // Fallback to user metadata if profile name not available
    if (!userName) {
      userName = user.user_metadata?.name || user.email?.split('@')[0] || 'User';
    }

    console.log("Generating code for user:", user.id, "Name:", userName);

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Parse name to generate code
    const generateCode = (fullName: string) => {
      const nameParts = fullName.trim().split(/\s+/);
      
      // Extract last name (first word of last part if multiple words)
      let lastName = "";
      if (nameParts.length >= 2) {
        // Get last part of name
        const lastPart = nameParts[nameParts.length - 1];
        // If last part has multiple words (hyphenated), take first
        lastName = lastPart.split(/[-]/)[0];
      } else {
        lastName = nameParts[0];
      }
      
      // Extract first name initial
      const firstInitial = nameParts[0].charAt(0);
      
      // Generate 3-digit random number
      const randomDigits = Math.floor(100 + Math.random() * 900); // 100-999
      
      // Combine and uppercase
      const code = `${lastName}${firstInitial}${randomDigits}`.toUpperCase();
      
      // Remove any non-alphanumeric characters and limit length
      return code.replace(/[^A-Z0-9]/g, '').substring(0, 15);
    };

    let code = generateCode(userName);
    let attempts = 0;
    const maxAttempts = 50; // More attempts since format is more constrained

    console.log("Generated initial code:", code);

    // Try to insert, regenerate if collision
    while (attempts < maxAttempts) {
      const { data, error } = await supabaseClient
        .from("referral_codes")
        .insert({ 
          user_id: user.id, 
          code,
          inviter_name: userName
        })
        .select()
        .single();

      if (!error) {
        // Create Stripe coupon with the referral code
        try {
          await stripe.coupons.create({
            id: code,
            name: `Referral Code: ${code}`,
            amount_off: 5000, // $50 in cents
            currency: 'usd',
            duration: 'once',
            max_redemptions: 1,
          });
          console.log(`Created Stripe coupon: ${code}`);
        } catch (stripeError: any) {
          // If coupon already exists, that's fine
          if (stripeError.code !== 'resource_already_exists') {
            console.error('Error creating Stripe coupon:', stripeError);
          }
        }

        return new Response(
          JSON.stringify({ code: data.code }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (error.code === "23505") {
        // Collision - regenerate with different random digits
        code = generateCode(userName);
        attempts++;
        console.log(`Collision, retrying with new code: ${code}`);
      } else {
        console.error("Error inserting referral code:", error);
        throw error;
      }
    }

    throw new Error("Could not generate unique code");
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});