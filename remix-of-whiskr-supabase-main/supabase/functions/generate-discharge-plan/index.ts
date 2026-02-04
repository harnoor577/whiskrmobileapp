import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withAIRateLimit } from '../_shared/aiRateLimiter.ts';

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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check rate limit for AI function
    const rateLimitResponse = await withAIRateLimit(supabase, user.id, 'generate_discharge_plan', corsHeaders);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Get user's clinic and unit preference
    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id, unit_preference')
      .eq('user_id', user.id)
      .single();

    // Determine unit preference: user preference > clinic data residency > both
    let unitPreference: 'metric' | 'imperial' | 'both' = 'both';
    if (profile?.unit_preference) {
      unitPreference = profile.unit_preference as 'metric' | 'imperial' | 'both';
    } else if (profile?.clinic_id) {
      const { data: clinic } = await supabase
        .from('clinics')
        .select('data_residency')
        .eq('id', profile.clinic_id)
        .single();
      
      if (clinic?.data_residency === 'us') {
        unitPreference = 'imperial';
      } else if (clinic?.data_residency === 'ca') {
        unitPreference = 'metric';
      }
    }

    const useMetric = unitPreference === 'metric';
    const useBoth = unitPreference === 'both';

    const { consultId } = await req.json();

    if (!consultId) {
      return new Response(JSON.stringify({ error: 'consultId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the consult data
    const { data: consult, error: consultError } = await supabase
      .from('consults')
      .select(`
        *,
        patient:patients (
          id,
          name,
          species,
          breed,
          sex,
          date_of_birth,
          weight_kg,
          weight_lb
        ),
        owner:owners (
          id,
          name,
          phone,
          email
        )
      `)
      .eq('id', consultId)
      .single();

    if (consultError || !consult) {
      console.error('Failed to fetch consult:', consultError);
      return new Response(JSON.stringify({ error: 'Failed to fetch consult data' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const patient = consult.patient as any;
    const owner = consult.owner as any;
    
    // Parse case_notes JSON for wellness and procedure data
    let wellnessData: Record<string, string> | null = null;
    let procedureData: Record<string, string> | null = null;
    
    if (consult.case_notes) {
      try {
        const parsed = JSON.parse(consult.case_notes);
        wellnessData = parsed.wellness || null;
        procedureData = parsed.procedure || null;
      } catch {
        // Not JSON, ignore
      }
    }
    
    // Get veterinarian name - prefer assigned vet, fall back to current user
    let vetName = 'Your Veterinarian';
    
    if (consult.vet_user_id) {
      // Fetch assigned veterinarian's name and prefix
      const { data: vetProfile } = await supabase
        .from('profiles')
        .select('name, name_prefix')
        .eq('user_id', consult.vet_user_id)
        .single();
      
      if (vetProfile?.name) {
        const prefix = vetProfile.name_prefix && vetProfile.name_prefix !== 'None' 
          ? vetProfile.name_prefix 
          : '';
        vetName = prefix ? `${prefix} ${vetProfile.name}` : vetProfile.name;
      }
    } else {
      // Fall back to current authenticated user's name
      const { data: currentUserProfile } = await supabase
        .from('profiles')
        .select('name, name_prefix')
        .eq('user_id', user.id)
        .single();
      
      if (currentUserProfile?.name) {
        const prefix = currentUserProfile.name_prefix && currentUserProfile.name_prefix !== 'None' 
          ? currentUserProfile.name_prefix 
          : '';
        vetName = prefix ? `${prefix} ${currentUserProfile.name}` : currentUserProfile.name;
      }
    }
    
    // Use consult weight if available, otherwise fall back to patient weight
    const weightKg = consult.weight_kg || patient.weight_kg;
    const weightLb = consult.weight_lb || patient.weight_lb;

    // Prepare context for AI - use SOAP first, fall back to wellness/procedure data
    const patientInfo = `${patient?.name}, ${patient?.species}, ${patient?.breed || 'mixed breed'}, ${patient?.sex || 'unknown sex'}`;
    
    // Use available data sources for the prompt (SOAP > Wellness > Procedure)
    const reasonForVisit = consult.reason_for_visit 
      || consult.soap_s 
      || wellnessData?.visitHeader 
      || procedureData?.procedureSummary 
      || 'Not specified';
    
    const diagnosis = consult.soap_a 
      || wellnessData?.assessment 
      || 'Not specified';
    
    const treatmentPlan = consult.final_treatment_plan 
      || consult.soap_p 
      || wellnessData?.recommendations 
      || procedureData?.postOpCare 
      || 'Not specified';
    
    const clinicalSummary = consult.final_summary 
      || wellnessData?.physicalExamination 
      || procedureData?.procedureDetails 
      || '';

    // Format weight display based on user/clinic preference
    let weightDisplay = 'Not recorded';
    if (weightKg) {
      if (useBoth) {
        weightDisplay = `${weightKg} kg (${weightLb} lb)`;
      } else if (useMetric) {
        weightDisplay = `${weightKg} kg`;
      } else {
        weightDisplay = `${weightLb} lb`;
      }
    }

    // Create prompt for discharge plan
    const systemPrompt = `You are a compassionate veterinary communication specialist. Generate a client-friendly discharge summary that is empathetic, reassuring, and professional. Address the pet owner directly using non-technical language where possible while remaining medically accurate.

DO NOT use any markdown formatting (no **, *, #, ##, ###). Use plain text only with section headings followed by colons.

Structure your response with these exact sections:

SUMMARY:
Generate a compassionate, client-friendly paragraph-form summary. Include:
- Reason for presentation and main clinical signs
- Key examination findings
- Diagnostics performed and significant results
- Diagnosis and urgency of the condition
- Treatment or surgery performed and important intraoperative findings
- Patient recovery status
- Medications and at-home care instructions
- Recheck or follow-up recommendations
- A supportive closing message

KEY FINDINGS:
List the most important clinical and diagnostic findings in clear, concise bullet points using plain bullet characters (•).

TREATMENT PLAN AND CARE INSTRUCTIONS:
Provide detailed medication instructions and at-home care:
${weightKg ? `
- Calculate all dosages based on ${weightKg} kg body weight
- Show both mg/kg AND calculated mg per dose
- Example: Carprofen (2 mg/kg PO BID) = ${(2 * weightKg).toFixed(1)} mg per dose, give one tablet twice daily
- Round to clinically appropriate tablet sizes or liquid volumes` : `
- Use general dosing guidance (weight-based calculations not possible without patient weight)`}
- Include specific medication names, exact dosages with units, frequencies (q24h, BID, TID), and durations
- Wound care or special care instructions
- Diet recommendations
- Activity restrictions

SIGNS TO WATCH FOR:
List warning signs that should prompt the owner to contact the clinic immediately or return for care.

FOLLOW-UP STEPS:
- Scheduled recheck appointments
- Additional tests or monitoring needed
- When to expect results
- Long-term management plan if applicable

CRITICAL MEDICATION RULES:
- NEVER use placeholders like "[Insert medication name]" or "[Insert dosage]"
- ALWAYS provide specific medication names and exact dosages ready for immediate use
- For common conditions, use evidence-based medication recommendations
- When information is missing, make safe, evidence-based assumptions based on standard veterinary practice

UNIT SYSTEM:
${useBoth ? 'Display BOTH metric AND imperial units (kg AND lb, °C AND °F) in all responses.' : useMetric ? 'Use ONLY metric units (kg, g, °C, mL/L) in all responses.' : 'Use ONLY imperial units (lb, oz, °F, gal) in all responses.'}

Tone should be warm, empathetic, reassuring, and professional throughout.`;

    const userPrompt = `Generate a discharge summary for:

Patient: ${patientInfo}
Weight: ${weightDisplay}
Reason for Visit: ${reasonForVisit}
Diagnosis: ${diagnosis}

Clinical Summary:
${clinicalSummary}

Treatment Plan:
${treatmentPlan}

Please provide a complete discharge summary with all 5 sections: Summary, Key Findings, Treatment Plan and Care Instructions, Signs to Watch For, and Follow-up Steps.`;

    console.log('[LOVABLE-AI] Calling gateway for discharge plan generation...');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Retry logic for transient errors (503, network issues)
    const maxRetries = 3;
    let lastError: Error | null = null;
    let response: Response | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await fetch(LOVABLE_AI_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_tokens: 4096,
            temperature: 0.3,
          }),
        });

        // If we get a non-retryable error, break immediately
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limits exceeded, please try again later.' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: 'Payment required, please add funds to your Lovable AI workspace.' }), {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // If successful, break out of retry loop
        if (response.ok) {
          break;
        }

        // For 503 or other server errors, retry with backoff
        if (response.status >= 500) {
          const errorText = await response.text();
          console.warn(`Attempt ${attempt}/${maxRetries} failed with status ${response.status}: ${errorText}`);
          lastError = new Error(`Gateway error: ${response.status}`);
          
          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 500; // 1s, 2s, 4s
            console.log(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        } else {
          // Non-retryable client error
          const errorText = await response.text();
          console.error('[LOVABLE-AI] Gateway error:', response.status, errorText);
          return new Response(JSON.stringify({ error: 'Failed to generate discharge plan' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (fetchError) {
        console.warn(`Attempt ${attempt}/${maxRetries} fetch error:`, fetchError);
        lastError = fetchError as Error;
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 500;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (!response?.ok) {
      console.error('All retry attempts failed:', lastError);
      return new Response(JSON.stringify({ error: 'Failed to generate discharge plan after multiple attempts' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const dischargePlan = data.choices?.[0]?.message?.content;

    console.log('[LOVABLE-AI] Discharge plan generated successfully, saving to database...');

    // Save discharge summary to consults table
    const { error: updateError } = await supabase
      .from('consults')
      .update({ discharge_summary: dischargePlan })
      .eq('id', consultId);

    if (updateError) {
      console.error('Failed to save discharge summary:', updateError);
      // Still return the generated content even if save fails
    }

    return new Response(JSON.stringify({ dischargePlan }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-discharge-plan function:', error);
    return new Response(JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
