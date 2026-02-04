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
      deviceFingerprint, 
      ipAddress, 
      userAgent,
      deviceName 
    } = await req.json();

    if (!deviceFingerprint) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's clinic and subscription tier
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('user_id', userId)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: clinic, error: clinicError } = await supabase
      .from('clinics')
      .select('max_devices, subscription_tier')
      .eq('id', profile.clinic_id)
      .single();

    if (clinicError || !clinic) {
      return new Response(
        JSON.stringify({ error: 'Clinic not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this device already exists
    const { data: existingDevice } = await supabase
      .from('device_sessions')
      .select('id, revoked')
      .eq('user_id', userId)
      .eq('device_fingerprint', deviceFingerprint)
      .single();

    // If device exists and not revoked, update last_active_at
    if (existingDevice && !existingDevice.revoked) {
      await supabase
        .from('device_sessions')
        .update({ 
          last_active_at: new Date().toISOString(),
          ip_address: ipAddress,
          user_agent: userAgent,
          device_name: deviceName
        })
        .eq('id', existingDevice.id);

      return new Response(
        JSON.stringify({ 
          allowed: true, 
          message: 'Device session updated',
          isExisting: true 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Enterprise has unlimited devices
    if (clinic.max_devices === -1) {
      return new Response(
        JSON.stringify({ 
          allowed: true, 
          message: 'Enterprise tier - unlimited devices' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Count active devices for this clinic (last 7 days, not revoked)
    const { data: activeDevices, error: countError } = await supabase
      .from('device_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', profile.clinic_id)
      .eq('revoked', false)
      .gte('last_active_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    if (countError) {
      console.error('Error counting devices:', countError);
      return new Response(
        JSON.stringify({ error: 'Failed to count devices' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const activeCount = activeDevices || 0;

    // Check if limit reached
    if (activeCount >= clinic.max_devices) {
      const tierName = clinic.subscription_tier || 'free';
      return new Response(
        JSON.stringify({ 
          allowed: false, 
          message: 'Device limit reached',
          currentDevices: activeCount,
          maxDevices: clinic.max_devices,
          tier: tierName
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Allow new device
    return new Response(
      JSON.stringify({ 
        allowed: true,
        currentDevices: activeCount,
        maxDevices: clinic.max_devices
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in check-device-limit:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});