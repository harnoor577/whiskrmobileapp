import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAdmin.auth.getUser(token);
    
    if (claimsError || !claimsData.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.user.id;

    // Verify caller is super_admin
    const { data: callerRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (roleError || !callerRole) {
      console.error("Role check error:", roleError);
      return new Response(JSON.stringify({ error: "Only super_admin can create master admins" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const { email, name } = await req.json();

    if (!email || !name) {
      return new Response(JSON.stringify({ error: "Email and name are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already exists
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (existingProfile) {
      return new Response(JSON.stringify({ error: "User with this email already exists" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Creating master admin for: ${email}`);

    // Step 1: Create a new clinic for this master admin
    const { data: newClinic, error: clinicError } = await supabaseAdmin
      .from("clinics")
      .insert({
        name: `${name}'s Clinic`,
        subscription_status: "active",
        subscription_tier: "unlimited",
        consults_cap: 999999,
        max_users: 100,
        max_devices: 50,
      })
      .select()
      .single();

    if (clinicError) {
      console.error("Clinic creation error:", clinicError);
      return new Response(JSON.stringify({ error: "Failed to create clinic" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Created clinic: ${newClinic.id}`);

    // Step 2: Create auth user with email confirmed
    const tempPassword = crypto.randomUUID() + "Aa1!"; // Secure temp password
    
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name },
    });

    if (authError) {
      console.error("Auth user creation error:", authError);
      // Rollback clinic
      await supabaseAdmin.from("clinics").delete().eq("id", newClinic.id);
      return new Response(JSON.stringify({ error: `Failed to create auth user: ${authError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = authUser.user.id;
    console.log(`Created auth user: ${newUserId}`);

    // Step 3: Create profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        user_id: newUserId,
        clinic_id: newClinic.id,
        email: email.toLowerCase(),
        name: name,
        status: "active",
      });

    if (profileError) {
      console.error("Profile creation error:", profileError);
      // Rollback
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      await supabaseAdmin.from("clinics").delete().eq("id", newClinic.id);
      return new Response(JSON.stringify({ error: "Failed to create profile" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Created profile for user: ${newUserId}`);

    // Step 4: Assign super_admin role
    const { error: superAdminError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: newUserId,
        role: "super_admin",
      });

    if (superAdminError) {
      console.error("Super admin role error:", superAdminError);
    }

    // Step 5: Assign vet clinic role
    const { error: clinicRoleError } = await supabaseAdmin
      .from("clinic_roles")
      .insert({
        user_id: newUserId,
        clinic_id: newClinic.id,
        role: "vet",
      });

    if (clinicRoleError) {
      console.error("Clinic role error:", clinicRoleError);
    }

    console.log(`Assigned roles for user: ${newUserId}`);

    // Step 6: Generate password reset link and send invitation email
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: email.toLowerCase(),
    });

    if (resetError) {
      console.error("Password reset link error:", resetError);
    }

    // Send invitation email using existing send-invitation-email function
    try {
      const inviteResponse = await fetch(`${supabaseUrl}/functions/v1/send-invitation-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          email: email.toLowerCase(),
          invitedByName: "Oura Vet AI",
          clinicName: newClinic.name,
          role: "Master Admin",
          inviteUrl: resetData?.properties?.action_link || `${supabaseUrl.replace('.supabase.co', '')}/reset-password`,
        }),
      });

      if (!inviteResponse.ok) {
        console.error("Invitation email failed:", await inviteResponse.text());
      } else {
        console.log("Invitation email sent successfully");
      }
    } catch (emailError) {
      console.error("Error sending invitation email:", emailError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Master admin created successfully for ${email}`,
        user_id: newUserId,
        clinic_id: newClinic.id,
        reset_link: resetData?.properties?.action_link,
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
