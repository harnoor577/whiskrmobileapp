import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Hash function matching generate-extension-token
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

    // Get Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();
    
    // Validate token format
    if (!token.startsWith('whiskr_ext_')) {
      return new Response(
        JSON.stringify({ error: 'Invalid token format' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Hash the provided token
    const tokenHash = await hashToken(token);

    // Create service role client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Find matching token in database
    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from('extension_tokens')
      .select('id, user_id, clinic_id, revoked_at')
      .eq('token_hash', tokenHash)
      .single();

    if (tokenError || !tokenRecord) {
      console.log('Token not found or error:', tokenError);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token is revoked
    if (tokenRecord.revoked_at) {
      return new Response(
        JSON.stringify({ error: 'Token has been revoked' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update last_used_at timestamp
    await supabaseAdmin
      .from('extension_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenRecord.id);

    console.log(`Token authenticated for user: ${tokenRecord.user_id}, clinic: ${tokenRecord.clinic_id}`);

    // Parse URL for query parameters
    const url = new URL(req.url);
    const consultId = url.searchParams.get('consultId');
    const dateParam = url.searchParams.get('date'); // Date filter (YYYY-MM-DD)
    const tzOffsetParam = url.searchParams.get('tzOffset'); // Timezone offset in minutes from UTC

    // Build query for consults
    let query = supabaseAdmin
      .from('consults')
      .select(`
        id,
        started_at,
        finalized_at,
        reason_for_visit,
        soap_s,
        soap_o,
        soap_a,
        soap_p,
        patient:patients!consults_patient_id_fkey (
          id,
          name,
          species,
          breed
        ),
        owner:owners!consults_owner_id_fkey (
          id,
          name
        )
      `)
      .eq('clinic_id', tokenRecord.clinic_id)
      .not('finalized_at', 'is', null); // Only finalized consults (excludes medical history imports)

    if (consultId) {
      // Fetch single consult
      query = query.eq('id', consultId);
    } else {
      // Add date filtering when date param provided
      if (dateParam) {
        // Parse timezone offset (minutes from UTC, negative = ahead of UTC)
        const tzOffset = parseInt(tzOffsetParam || '0', 10);
        const offsetMs = tzOffset * 60 * 1000;
        
        // Create start/end of day in user's local timezone, then convert to UTC
        const localStart = new Date(`${dateParam}T00:00:00.000Z`);
        localStart.setTime(localStart.getTime() + offsetMs);
        
        const localEnd = new Date(`${dateParam}T23:59:59.999Z`);
        localEnd.setTime(localEnd.getTime() + offsetMs);
        
        console.log(`Date filter: ${dateParam}, tzOffset: ${tzOffset}, range: ${localStart.toISOString()} to ${localEnd.toISOString()}`);
        
        query = query
          .gte('started_at', localStart.toISOString())
          .lte('started_at', localEnd.toISOString());
      } else {
        // Default: last 30 days if no date specified
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        query = query.gte('finalized_at', thirtyDaysAgo.toISOString());
      }
      
      query = query
        .order('started_at', { ascending: false })
        .limit(50);
    }

    const { data: consults, error: consultsError } = await query;

    if (consultsError) {
      console.error('Error fetching consults:', consultsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch consults' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transform the data for the extension with patientId for grouping
    const transformedConsults = (consults || []).map((consult: any) => ({
      id: consult.id,
      patientId: consult.patient?.id || null,
      patientName: consult.patient?.name || 'Unknown',
      species: consult.patient?.species || 'Unknown',
      breed: consult.patient?.breed || '',
      ownerName: consult.owner?.name || 'Unknown',
      startedAt: consult.started_at || null, // Raw ISO timestamp for client-side formatting
      finalizedAt: consult.finalized_at,
      reasonForVisit: consult.reason_for_visit || '',
      soap_s: consult.soap_s || '',
      soap_o: consult.soap_o || '',
      soap_a: consult.soap_a || '',
      soap_p: consult.soap_p || '',
    }));

    console.log(`Returning ${transformedConsults.length} consults`);

    return new Response(
      JSON.stringify({
        success: true,
        consults: transformedConsults,
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
