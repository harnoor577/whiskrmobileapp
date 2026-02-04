import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { fileId } = await req.json();

    if (!fileId) {
      return new Response(JSON.stringify({ error: 'Missing fileId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's clinic
    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get file
    const { data: file, error: fileError } = await supabase
      .from('file_assets')
      .select('*')
      .eq('id', fileId)
      .eq('clinic_id', profile.clinic_id)
      .single();

    if (fileError || !file) {
      return new Response(JSON.stringify({ error: 'File not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get case context if available
    let caseContext = null;
    if (file.consult_id) {
      const { data: consult } = await supabase
        .from('consults')
        .select('*, patient:patients(*)')
        .eq('id', file.consult_id)
        .single();

      if (consult) {
        caseContext = {
          patientName: consult.patient.name,
          species: consult.patient.species,
          breed: consult.patient.breed,
          dateOfBirth: consult.patient.date_of_birth,
          reasonForVisit: consult.reason_for_visit,
          history: consult.soap_s,
          assessment: consult.soap_a,
        };
      }
    }

    // Call analyze-document function
    const { data: analysisData, error: analysisError } = await supabase.functions.invoke(
      'analyze-document',
      {
        body: {
          fileId,
          caseContext,
        },
      }
    );

    if (analysisError) {
      console.error('Analysis error:', analysisError);
      return new Response(JSON.stringify({ error: 'Failed to regenerate evaluation' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, analysis: analysisData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Regenerate evaluation error:', error);
    return new Response(JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
