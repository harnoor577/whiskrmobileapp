import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Rate limiting configuration
const MAX_ATTEMPTS_PER_EMAIL = 5;
const MAX_ATTEMPTS_PER_IP = 20;
const WINDOW_MINUTES = 15;
const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_DURATION_MINUTES = 30;

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const parsed = credentialsSchema.safeParse(body);

    if (!parsed.success) {
      console.log("[VERIFY-CREDENTIALS] Validation error:", parsed.error.errors);
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password } = parsed.data;
    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                     req.headers.get("cf-connecting-ip") || 
                     "unknown";

    console.log("[VERIFY-CREDENTIALS] Verifying credentials for:", email.substring(0, 3) + "***");

    // Create admin client for rate limiting checks and credential verification
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check rate limits for this email
    const emailIdentifier = `verify_creds:${email.toLowerCase()}`;
    const ipIdentifier = `verify_creds_ip:${clientIP}`;

    // Check email rate limit
    const { data: emailRateData } = await supabaseAdmin
      .from("rate_limit_attempts")
      .select("*")
      .eq("identifier", emailIdentifier)
      .eq("action", "verify_credentials")
      .single();

    if (emailRateData) {
      const windowStart = new Date(emailRateData.window_start);
      const windowEnd = new Date(windowStart.getTime() + WINDOW_MINUTES * 60 * 1000);
      const now = new Date();

      // Check for account lockout
      if (emailRateData.locked_until) {
        const lockedUntil = new Date(emailRateData.locked_until);
        if (now < lockedUntil) {
          console.log("[VERIFY-CREDENTIALS] Account locked until:", lockedUntil);
          return new Response(
            JSON.stringify({ 
              valid: false, 
              error: "Account temporarily locked",
              lockedUntil: lockedUntil.toISOString()
            }),
            { status: 423, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Check rate limit within window
      if (now < windowEnd && emailRateData.attempt_count >= MAX_ATTEMPTS_PER_EMAIL) {
        console.log("[VERIFY-CREDENTIALS] Rate limit exceeded for email");
        return new Response(
          JSON.stringify({ 
            valid: false, 
            error: "Too many attempts",
            retryAfter: windowEnd.toISOString()
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check IP rate limit
    const { data: ipRateData } = await supabaseAdmin
      .from("rate_limit_attempts")
      .select("*")
      .eq("identifier", ipIdentifier)
      .eq("action", "verify_credentials")
      .single();

    if (ipRateData) {
      const windowStart = new Date(ipRateData.window_start);
      const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000); // 1 hour for IP
      const now = new Date();

      if (now < windowEnd && ipRateData.attempt_count >= MAX_ATTEMPTS_PER_IP) {
        console.log("[VERIFY-CREDENTIALS] Rate limit exceeded for IP");
        return new Response(
          JSON.stringify({ 
            valid: false, 
            error: "Too many attempts from this location",
            retryAfter: windowEnd.toISOString()
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // First verify this is a super_admin user
    const { data: isSuperAdmin } = await supabaseAdmin.rpc("check_requires_mfa", {
      p_email: email,
    });

    if (!isSuperAdmin) {
      // Not a super admin - don't reveal this, just say invalid credentials
      console.log("[VERIFY-CREDENTIALS] Not a super admin, returning generic error");
      await recordAttempt(supabaseAdmin, emailIdentifier, "verify_credentials", false);
      await recordAttempt(supabaseAdmin, ipIdentifier, "verify_credentials", false);
      
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid credentials" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Attempt to sign in to verify credentials
    // We use a separate client instance to avoid any session pollution
    const verifyClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Use the admin API to verify the password
    // First, get the user by email
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (userError) {
      console.error("[VERIFY-CREDENTIALS] Error listing users:", userError);
      return new Response(
        JSON.stringify({ valid: false, error: "Verification failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const user = userData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      console.log("[VERIFY-CREDENTIALS] User not found");
      await recordAttempt(supabaseAdmin, emailIdentifier, "verify_credentials", false);
      await recordAttempt(supabaseAdmin, ipIdentifier, "verify_credentials", false);
      
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid credentials" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use signInWithPassword to verify credentials
    // This creates a temporary session that we'll immediately discard
    const { data: signInData, error: signInError } = await verifyClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      console.log("[VERIFY-CREDENTIALS] Sign in failed:", signInError.message);
      
      // Record failed attempt
      const attemptResult = await recordAttempt(supabaseAdmin, emailIdentifier, "verify_credentials", false);
      await recordAttempt(supabaseAdmin, ipIdentifier, "verify_credentials", false);

      // Check if we should lock the account
      if (attemptResult && attemptResult.attempt_count >= LOCKOUT_THRESHOLD) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
        await supabaseAdmin
          .from("rate_limit_attempts")
          .update({ 
            locked_until: lockedUntil.toISOString(),
            lockout_reason: "Too many failed login attempts"
          })
          .eq("identifier", emailIdentifier)
          .eq("action", "verify_credentials");

        console.log("[VERIFY-CREDENTIALS] Account locked due to too many attempts");
        return new Response(
          JSON.stringify({ 
            valid: false, 
            error: "Account temporarily locked due to too many failed attempts",
            lockedUntil: lockedUntil.toISOString()
          }),
          { status: 423, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ valid: false, error: "Invalid credentials" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Credentials are valid! Immediately sign out to destroy the session
    if (signInData.session) {
      try {
        // Sign out using the session token
        await verifyClient.auth.signOut();
        console.log("[VERIFY-CREDENTIALS] Temporary session destroyed");
      } catch (signOutError) {
        console.error("[VERIFY-CREDENTIALS] Error signing out:", signOutError);
        // Continue anyway - the session will expire
      }
    }

    // Clear the rate limit on successful verification
    await supabaseAdmin
      .from("rate_limit_attempts")
      .delete()
      .eq("identifier", emailIdentifier)
      .eq("action", "verify_credentials");

    console.log("[VERIFY-CREDENTIALS] Credentials verified successfully");

    return new Response(
      JSON.stringify({ valid: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[VERIFY-CREDENTIALS] Unexpected error:", error);
    return new Response(
      JSON.stringify({ valid: false, error: "Verification failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// deno-lint-ignore no-explicit-any
async function recordAttempt(
  supabase: any,
  identifier: string,
  action: string,
  success: boolean
): Promise<{ attempt_count: number } | null> {
  const now = new Date();
  
  try {
    // Try to get existing record
    const { data: existing } = await supabase
      .from("rate_limit_attempts")
      .select("*")
      .eq("identifier", identifier)
      .eq("action", action)
      .single();

    if (existing) {
      const windowStart = new Date(existing.window_start);
      const windowEnd = new Date(windowStart.getTime() + WINDOW_MINUTES * 60 * 1000);

      if (now > windowEnd) {
        // Window expired, reset
        const { data } = await supabase
          .from("rate_limit_attempts")
          .update({
            attempt_count: success ? 0 : 1,
            window_start: now.toISOString(),
            updated_at: now.toISOString(),
            locked_until: null,
            lockout_reason: null,
          })
          .eq("id", existing.id)
          .select()
          .single();
        return data;
      } else {
        // Within window, increment if not success
        const newCount = success ? 0 : existing.attempt_count + 1;
        const { data } = await supabase
          .from("rate_limit_attempts")
          .update({
            attempt_count: newCount,
            updated_at: now.toISOString(),
          })
          .eq("id", existing.id)
          .select()
          .single();
        return data;
      }
    } else {
      // Create new record
      const { data } = await supabase
        .from("rate_limit_attempts")
        .insert({
          identifier,
          action,
          attempt_count: success ? 0 : 1,
          window_start: now.toISOString(),
        })
        .select()
        .single();
      return data;
    }
  } catch (error) {
    console.error("[VERIFY-CREDENTIALS] Error recording attempt:", error);
    return null;
  }
}
