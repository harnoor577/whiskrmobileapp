import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user before processing
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      throw new Error('Missing Supabase credentials');
    }

    // Create client with user's auth token for verification
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify user authentication
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message || 'No user found');
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    // Create service role client for privileged operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { consultId, soapText } = await req.json();

    if (!consultId || !soapText) {
      return new Response(
        JSON.stringify({ error: 'consultId and soapText required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get consult with patient details
    const { data: consult, error: consultError } = await supabase
      .from('consults')
      .select(`
        *,
        patient:patients (
          id,
          species,
          breed,
          date_of_birth
        )
      `)
      .eq('id', consultId)
      .single();

    if (consultError) throw consultError;

    // Verify user has access to this consult's clinic
    const { data: userProfile, error: profileError } = await authClient
      .from('profiles')
      .select('clinic_id')
      .eq('user_id', user.id)
      .single();

    if (profileError || !userProfile) {
      console.error('Profile not found for user:', user.id);
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (userProfile.clinic_id !== consult.clinic_id) {
      console.error('Clinic access denied:', { userClinic: userProfile.clinic_id, consultClinic: consult.clinic_id });
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Access denied to this consult' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Clinic access verified for consult:', consultId);

    // Get normal ranges for this patient
    let normalRangesData = null;
    let ageClass = 'adult';
    if (consult?.patient) {
      try {
        const rangesResponse = await supabase.functions.invoke('get-normal-ranges', {
          body: {
            species: consult.patient.species,
            breed: consult.patient.breed,
            dateOfBirth: consult.patient.date_of_birth
          }
        });
        
        if (rangesResponse.data) {
          normalRangesData = rangesResponse.data.normalRanges;
          ageClass = rangesResponse.data.ageClass;
          console.log('Retrieved normal ranges for vitals extraction:', normalRangesData);
        }
      } catch (rangesError) {
        console.error('Error fetching normal ranges:', rangesError);
        // Continue without ranges if fetch fails
      }
    }

    // Build enhanced system prompt with normal ranges
    let systemPrompt = `You are a veterinary data extraction assistant. Extract vitals from SOAP notes.`;
    
    if (normalRangesData && consult?.patient) {
      const species = consult.patient.species || 'unknown';
      const breed = consult.patient.breed || '';
      const ageText = ageClass === 'puppy' || ageClass === 'kitten' ? `young ${ageClass}` : `${ageClass}`;
      
      systemPrompt += `\n\nFor this ${ageText} ${species}${breed ? ' (' + breed + ')' : ''}, if a vital is described as "normal" or "assumed normal" without a specific value, use these breed/age-specific typical values:`;
      
      if (normalRangesData.heart_rate) {
        systemPrompt += `\n- Heart rate: ${normalRangesData.heart_rate.typical} bpm`;
      }
      if (normalRangesData.respiratory_rate) {
        systemPrompt += `\n- Respiratory rate: ${normalRangesData.respiratory_rate.typical} breaths/min`;
      }
      if (normalRangesData.temperature) {
        systemPrompt += `\n- Temperature: ${normalRangesData.temperature.typical}°F`;
      }
      if (normalRangesData.crt) {
        systemPrompt += `\n- CRT: "${normalRangesData.crt.typical}"`;
      }
      if (normalRangesData.mucous_membranes) {
        systemPrompt += `\n- Mucous membranes: "${normalRangesData.mucous_membranes.typical}"`;
      }
    }

    systemPrompt += `

Return ONLY a JSON object with these fields (use null if not found):
{
  "temperature_f": number or null,
  "temperature_c": number or null,
  "heart_rate": number or null,
  "respiratory_rate": number or null,
  "body_condition_score": string or null,
  "dehydration_percent": string or null,
  "pain_score": number or null,
  "crt": string or null,
  "mucous_membranes": string or null,
  "attitude": string or null
}

Guidelines:
- Temperature: Extract both F and C if available, convert if only one unit given
- Heart rate and respiratory rate: numbers only (bpm)
- Pain score: 0-10 scale
- CRT: Use specific value if mentioned, otherwise use breed-specific typical if described as "normal"
- Body condition score: "Normal", "Overweight", "Underweight", "Thin", "Obese", etc.
- Dehydration: "Normal", "5%", "8%", etc.
- Mucous membranes: Use specific value if mentioned, otherwise use breed-specific typical if described as "normal"
- Attitude: "Bright, alert, responsive", "Dull", "Depressed", "QAR", "BAR", etc.`;

    // Use Lovable AI Gateway to extract vitals from SOAP notes
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('[LOVABLE-AI] Extracting vitals from SOAP');
    const response = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract vitals from this SOAP note:\n\n${soapText}` }
        ],
        max_tokens: 1024,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[LOVABLE-AI] Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limits exceeded, please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required, please add funds to your Lovable AI workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Lovable AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content;
    const extracted = JSON.parse(extractedText);

    // Update consult with extracted vitals
    const { error: updateError } = await supabase
      .from('consults')
      .update({
        vitals_temperature_f: extracted.temperature_f,
        vitals_temperature_c: extracted.temperature_c,
        vitals_heart_rate: extracted.heart_rate,
        vitals_respiratory_rate: extracted.respiratory_rate,
        vitals_body_condition_score: extracted.body_condition_score,
        vitals_dehydration_percent: extracted.dehydration_percent,
        vitals_pain_score: extracted.pain_score,
        vitals_crt: extracted.crt,
        vitals_mucous_membranes: extracted.mucous_membranes,
        vitals_attitude: extracted.attitude,
        vitals_last_updated_at: new Date().toISOString(),
      })
      .eq('id', consultId);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ success: true, vitals: extracted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error extracting vitals:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
