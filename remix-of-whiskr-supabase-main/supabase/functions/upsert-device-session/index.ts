import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use authenticated user ID instead of trusting request body
    const userId = user.id;

    const { 
      clinicId,
      deviceFingerprint, 
      ipAddress, 
      userAgent,
      deviceName 
    } = await req.json();

    console.log('[UPSERT-DEVICE] Request received:', {
      userId,
      clinicId,
      deviceFingerprint: deviceFingerprint?.substring(0, 10) + '...',
      deviceName,
      ipAddress
    });

    if (!clinicId || !deviceFingerprint) {
      console.error('[UPSERT-DEVICE] Missing required fields:', {
        hasClinicId: !!clinicId,
        hasDeviceFingerprint: !!deviceFingerprint
      });
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if device session already exists
    const { data: existingSession } = await supabase
      .from('device_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('device_fingerprint', deviceFingerprint)
      .maybeSingle();

    let data;
    let error;

    if (existingSession) {
      // Update existing session
      const result = await supabase
        .from('device_sessions')
        .update({
          clinic_id: clinicId,
          ip_address: ipAddress,
          user_agent: userAgent,
          device_name: deviceName,
          last_active_at: new Date().toISOString()
        })
        .eq('id', existingSession.id)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      // Insert new session
      const result = await supabase
        .from('device_sessions')
        .insert({
          user_id: userId,
          clinic_id: clinicId,
          device_fingerprint: deviceFingerprint,
          ip_address: ipAddress,
          user_agent: userAgent,
          device_name: deviceName,
          last_active_at: new Date().toISOString()
        })
        .select()
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error('[UPSERT-DEVICE] Error upserting device session:', error);
      return new Response(
        JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[UPSERT-DEVICE] Device session created/updated successfully:', {
      id: data.id,
      deviceName: data.device_name
    });

    return new Response(
      JSON.stringify({ success: true, session: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in upsert-device-session:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});