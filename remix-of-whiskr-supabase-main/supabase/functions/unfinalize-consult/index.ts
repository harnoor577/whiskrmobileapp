import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UnfinalizeRequest {
  consultId: string;
}

// Decode JWT payload without verification (Supabase handles signature verification)
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Decode JWT to get user ID
    const payload = decodeJwtPayload(token);
    if (!payload?.sub || typeof payload.sub !== 'string') {
      console.error("Invalid JWT: missing sub claim");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = payload.sub;
    const user = { id: userId };

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { consultId }: UnfinalizeRequest = await req.json();

    if (!consultId) {
      return new Response(
        JSON.stringify({ error: "consultId is required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // RBAC: Check user roles - only admin, dvm (vet), or super_admin can unfinalize
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('clinic_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.clinic_id) {
      return new Response(
        JSON.stringify({ error: "User not associated with a clinic" }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check user_roles for admin/super_admin
    const { data: userRoles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const hasAdminRole = userRoles?.some(r => r.role === 'admin' || r.role === 'super_admin');

    // Check clinic_roles for vet (DVM)
    const { data: clinicRoles } = await supabaseClient
      .from('clinic_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('clinic_id', profile.clinic_id);

    const hasVetRole = clinicRoles?.some(r => r.role === 'vet');

    // Enforce RBAC: Only admin, dvm/vet, or super_admin
    if (!hasAdminRole && !hasVetRole) {
      console.log(`RBAC denied for user ${user.id}: no admin or vet role`);
      return new Response(
        JSON.stringify({ error: "Unfinalize is restricted to DVMs and Admins." }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current consult
    const { data: consult, error: consultError } = await supabaseClient
      .from('consults')
      .select('id, status, version, clinic_id, finalized_at, finalized_by, timeline')
      .eq('id', consultId)
      .single();

    if (consultError || !consult) {
      console.error("Error fetching consult:", consultError);
      return new Response(
        JSON.stringify({ error: "Consultation not found" }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has access to this clinic's consults
    if (consult.clinic_id !== profile.clinic_id) {
      return new Response(
        JSON.stringify({ error: "Access denied to this consultation" }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already not finalized (database uses 'finalized' status)
    if (consult.status !== 'finalized') {
      return new Response(
        JSON.stringify({ error: "Consultation is not finalized" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const previousVersion = consult.version || 1;
    const newVersion = previousVersion + 1;

    // Create timeline entry for audit trail
    const timelineEntry = {
      event: 'unfinalized',
      by: user.id,
      at: new Date().toISOString(),
      from_version: previousVersion,
      to_version: newVersion,
    };

    // Get current timeline and append new entry
    const currentTimeline = (consult.timeline as any) || [];
    const updatedTimeline = Array.isArray(currentTimeline) 
      ? [...currentTimeline, timelineEntry]
      : [timelineEntry];

    // Update consultation: unfinalize, increment version, and update timeline
    const { error: updateError } = await supabaseClient
      .from('consults')
      .update({
        status: 'draft',
        finalized_at: null,
        finalized_by: null,
        version: newVersion,
        regen_status: null, // Clear regen status for fresh edits
        timeline: updatedTimeline,
      })
      .eq('id', consultId);

    if (updateError) {
      console.error("Error updating consult:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to unfinalize consultation" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log audit event
    await supabaseClient
      .from('audit_events')
      .insert({
        clinic_id: consult.clinic_id,
        user_id: user.id,
        action: 'unfinalize_consult',
        entity_type: 'consult',
        entity_id: consultId,
        details: {
          previous_version: previousVersion,
          new_version: newVersion,
          previous_finalized_at: consult.finalized_at,
          previous_finalized_by: consult.finalized_by,
        },
      });

    console.log(`Consultation ${consultId} unfinalized by user ${user.id} - version ${previousVersion} → ${newVersion}`);

    return new Response(
      JSON.stringify({
        success: true,
        newVersion,
        message: "Consultation unfinalized successfully",
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Error in unfinalize-consult:", error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
