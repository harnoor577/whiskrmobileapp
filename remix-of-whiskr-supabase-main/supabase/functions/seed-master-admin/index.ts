import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// One-time seeder - protected by secret key
const SEED_SECRET = Deno.env.get("MASTER_ADMIN_SEED_SECRET") || "oura-vet-seed-2024";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { email, name, secret } = await req.json();

    // Verify seed secret
    if (secret !== SEED_SECRET) {
      return new Response(JSON.stringify({ error: "Invalid seed secret" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!email || !name) {
      return new Response(JSON.stringify({ error: "Email and name are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already exists in profiles
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, user_id, clinic_id")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (existingProfile) {
      // User exists - just upgrade them to super_admin
      console.log(`User already exists, upgrading to super_admin: ${email}`);
      
      // Add super_admin role (ignore if already exists)
      await supabaseAdmin
        .from("user_roles")
        .upsert({
          user_id: existingProfile.user_id,
          role: "super_admin",
        }, { onConflict: "user_id,role" });

      // Upgrade their clinic to unlimited
      await supabaseAdmin
        .from("clinics")
        .update({
          subscription_status: "active",
          subscription_tier: "unlimited",
          consults_cap: 999999,
          max_users: 100,
          max_devices: 50,
        })
        .eq("id", existingProfile.clinic_id);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Existing user upgraded to master admin: ${email}`,
          user_id: existingProfile.user_id,
          clinic_id: existingProfile.clinic_id,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Seeding master admin for: ${email}`);

    // Create auth user - the handle_new_user trigger will auto-create profile and clinic
    const tempPassword = crypto.randomUUID() + "Aa1!";
    
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: { 
        name,
        clinic_name: `${name}'s Clinic`,
      },
    });

    if (authError) {
      console.error("Auth user creation error:", authError);
      return new Response(JSON.stringify({ error: `Failed to create auth user: ${authError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = authUser.user.id;
    console.log(`Created auth user: ${newUserId}`);

    // Wait a moment for the trigger to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get the auto-created profile and clinic
    const { data: newProfile, error: profileFetchError } = await supabaseAdmin
      .from("profiles")
      .select("id, clinic_id")
      .eq("user_id", newUserId)
      .maybeSingle();

    if (profileFetchError || !newProfile) {
      console.error("Failed to fetch auto-created profile:", profileFetchError);
      return new Response(JSON.stringify({ error: "Profile was not auto-created by trigger" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found auto-created profile with clinic: ${newProfile.clinic_id}`);

    // Upgrade the auto-created clinic to unlimited tier
    const { error: clinicUpdateError } = await supabaseAdmin
      .from("clinics")
      .update({
        subscription_status: "active",
        subscription_tier: "unlimited",
        consults_cap: 999999,
        max_users: 100,
        max_devices: 50,
      })
      .eq("id", newProfile.clinic_id);

    if (clinicUpdateError) {
      console.error("Clinic upgrade error:", clinicUpdateError);
    }

    // Add super_admin role (trigger adds 'admin' app_role, we need super_admin)
    const { error: superAdminError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: newUserId,
        role: "super_admin",
      });

    if (superAdminError) {
      console.error("Super admin role error:", superAdminError);
    }

    console.log(`Assigned super_admin role for user: ${newUserId}`);

    // Generate password reset link
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: email.toLowerCase(),
    });

    if (resetError) {
      console.error("Password reset link error:", resetError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Master admin created successfully for ${email}`,
        user_id: newUserId,
        clinic_id: newProfile.clinic_id,
        reset_link: resetData?.properties?.action_link,
        temp_password: tempPassword,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: unknown) {
    console.error("Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
