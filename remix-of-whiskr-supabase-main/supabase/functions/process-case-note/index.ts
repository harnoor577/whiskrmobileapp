import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { callGemini, GEMINI_MODEL } from '../_shared/geminiClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { consultId, note } = await req.json();

    if (!consultId || !note) {
      return new Response(
        JSON.stringify({ error: 'consultId and note are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    //  Fetch consult context
    const { data: consult, error: consultError } = await supabaseClient
      .from('consults')
      .select(`
        *,
        patient:patients(*),
        owner:owners(*)
      `)
      .eq('id', consultId)
      .maybeSingle();

    if (consultError) throw new Error(`Database error: ${consultError.message}`);
    if (!consult) throw new Error(`Consult not found with ID: ${consultId}`);

    // Call AI to incorporate note into context
    try {
      const systemPrompt = `You are a veterinary AI assistant. A case note has been added. Update your internal memory with this information.

Patient: ${consult.patient.name} (${consult.patient.species})
Current SOAP:
S: ${consult.soap_s || 'Not recorded'}
O: ${consult.soap_o || 'Not recorded'}
A: ${consult.soap_a || 'Not recorded'}
P: ${consult.soap_p || 'Not recorded'}

Case note: ${note}

Summarize how this note updates or adds to the clinical picture.`;

      console.log('[GEMINI-3-FLASH] Processing case note');
      await callGemini({
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Process this case note and summarize the clinical update.' }],
        maxTokens: 1024,
        model: GEMINI_MODEL,
      });
      console.log('[GEMINI-3-FLASH] Case note processed successfully');
    } catch (aiError) {
      console.error('[GEMINI-3-FLASH] AI processing failed:', aiError);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Case note processed successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error processing case note:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
