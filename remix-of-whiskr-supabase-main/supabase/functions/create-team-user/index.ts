import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { sanitizeValidationError } from '../_shared/errorHandler.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const createUserSchema = z.object({
  email: z.string().email().max(255),
  role: z.enum(['admin', 'standard']),
  clinicRole: z.enum(['vet_tech', 'receptionist']).optional(),
  clinicId: z.string().uuid().optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get the auth token from the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    // Verify the user is authenticated and is an admin
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Check if user is admin
    const { data: rolesList } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isAdmin = (rolesList ?? []).some((r: any) => r.role === "admin");

    if (!isAdmin) {
      throw new Error("Admin access required");
    }

// Clinic will be determined from validated input or fallback membership

    // Validate input
    const body = await req.json();
    const validationResult = createUserSchema.safeParse(body);
    
    if (!validationResult.success) {
      const sanitized = sanitizeValidationError(validationResult.error.errors.map(e => ({
        path: e.path.map(String),
        message: e.message,
      })));
      return new Response(
        JSON.stringify(sanitized),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

const { email, role, clinicRole, clinicId } = validationResult.data;

    // Determine target clinic and validate admin membership
    let targetClinicId = clinicId as string | undefined;
    if (!targetClinicId) {
      const { data: membership } = await supabaseAdmin
        .from("profiles")
        .select("clinic_id")
        .eq("user_id", user.id)
        .maybeSingle();
      targetClinicId = membership?.clinic_id as string | undefined;
    }
    if (!targetClinicId) {
      throw new Error("Unable to determine clinic. Please select a clinic and try again.");
    }
    // Ensure the requesting admin belongs to this clinic
    const { data: adminMembership } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .eq("clinic_id", targetClinicId)
      .maybeSingle();
    if (!adminMembership) {
      throw new Error("Admin is not a member of the selected clinic");
    }

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = existingUser?.users.find(u => u.email === email);

    // Check if clinic can add more users
const { data: canAdd, error: checkError } = await supabaseAdmin
      .rpc("can_add_user", { clinic_uuid: targetClinicId });

    if (checkError || !canAdd) {
      throw new Error("User limit reached. Please upgrade your plan.");
    }

    let userId: string;
    let isNewUser = false;

    if (existingAuthUser) {
      // User exists, just add them to this clinic
      userId = existingAuthUser.id;

      // Idempotent: if profile already exists for this clinic, return success
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("user_id", userId)
        .eq("clinic_id", targetClinicId)
        .maybeSingle();

      if (existingProfile) {
        return new Response(
          JSON.stringify({
            success: true,
            userId,
            isNewUser: false,
            message: "User already exists in this clinic",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      }

      // Create profile for this clinic
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert({
          user_id: userId,
          clinic_id: targetClinicId,
          name: existingAuthUser.user_metadata?.name || "User",
          email,
          status: "active",
        });

      if (profileError) {
        // If duplicate due to race condition, treat as success
        if (profileError.code === '23505') {
          return new Response(
            JSON.stringify({
              success: true,
              userId,
              isNewUser: false,
              message: "User already exists in this clinic",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            }
          );
        }
        throw profileError;
      }
    } else {
      // New user - send invitation email
      isNewUser = true;
      
      // Generate a secure random password
      const tempPassword = crypto.randomUUID();
      
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: false, // Require email confirmation
user_metadata: {
          name: "New User",
          clinic_id: targetClinicId,
        },
      });

      if (createError) {
        throw createError;
      }

      userId = newUser.user.id;

      // Create profile
const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert({
          user_id: userId,
          clinic_id: targetClinicId,
          name: "New User",
          email,
          status: "active",
        });

      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw profileError;
      }

      // Generate password reset link
      const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: email,
        options: {
          redirectTo: `${req.headers.get('origin')}/login`,
        }
      });

      if (resetError) {
        console.error('Error generating invite link:', resetError);
      }

      // Create invitation record
      const { error: invitationError } = await supabaseAdmin
        .from("user_invitations")
        .insert({
          email,
          clinic_id: targetClinicId,
          role: role as any,
          invited_by: user.id,
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        });

      if (invitationError) {
        console.error('Error creating invitation record:', invitationError);
      }

      // Send invitation email
      const { error: emailError } = await supabaseAdmin.functions.invoke('send-invitation-email', {
        body: {
          email,
          inviteLink: resetData?.properties?.action_link || '',
          clinicName: targetClinicId,
          inviterName: user?.email || 'Admin',
          accountRole: role,
          clinicRole: clinicRole || 'none',
        },
      });

      if (emailError) {
        console.error('Error sending invitation email:', emailError);
      }
    }

    // Assign account role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({
        user_id: userId,
        role: role || "standard",
      }, { onConflict: 'user_id,role' });

    if (roleError && roleError.code !== '23505') {
      if (isNewUser) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      }
      throw roleError;
    }

    // Assign clinic role if provided
    if (clinicRole) {
const { error: clinicRoleError } = await supabaseAdmin
        .from("clinic_roles")
        .upsert({
          user_id: userId,
          clinic_id: targetClinicId,
          role: clinicRole,
        }, { onConflict: 'user_id,clinic_id' });

      if (clinicRoleError && clinicRoleError.code !== '23505') {
        if (isNewUser) {
          await supabaseAdmin.auth.admin.deleteUser(userId);
        }
        throw clinicRoleError;
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId,
        isNewUser,
        message: isNewUser ? 'Invitation email sent' : 'User added to clinic'
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in create-team-user:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});