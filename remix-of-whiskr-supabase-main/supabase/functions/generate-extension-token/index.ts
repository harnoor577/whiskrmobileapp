import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple bcrypt-like hash using Web Crypto API
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get auth header for user verification
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's JWT to verify authentication
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating extension token for user: ${user.id}`);

    // Create service role client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's clinic_id from profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('clinic_id')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile?.clinic_id) {
      console.error('Profile error:', profileError);
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse optional token name from request body
    let tokenName = 'EzyVet Extension';
    try {
      const body = await req.json();
      if (body?.name && typeof body.name === 'string') {
        tokenName = body.name.substring(0, 100);
      }
    } catch {
      // No body or invalid JSON, use default name
    }

    // Generate cryptographically secure random token (32 bytes)
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const tokenBase64 = encodeBase64(randomBytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    
    const plainToken = `whiskr_ext_${tokenBase64}`;

    // Hash the token for storage
    const tokenHash = await hashToken(plainToken);

    // Store the token hash in the database
    const { data: tokenRecord, error: insertError } = await supabaseAdmin
      .from('extension_tokens')
      .insert({
        user_id: user.id,
        clinic_id: profile.clinic_id,
        token_hash: tokenHash,
        name: tokenName,
      })
      .select('id, name, created_at')
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Token created successfully: ${tokenRecord.id}`);

    // Return the plain token (only shown once!)
    return new Response(
      JSON.stringify({
        success: true,
        token: plainToken,
        tokenId: tokenRecord.id,
        name: tokenRecord.name,
        createdAt: tokenRecord.created_at,
        message: 'Copy this token now. It won\'t be shown again.',
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
