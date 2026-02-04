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
    const rateLimitResponse = await withAIRateLimit(supabase, user.id, 'generate_client_education', corsHeaders);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

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
          age
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
    
    // Determine the primary condition/diagnosis from available data
    const diagnosis = consult.soap_a 
      || wellnessData?.assessment 
      || procedureData?.procedureSummary
      || 'General wellness';
    
    const treatmentPlan = consult.final_treatment_plan 
      || consult.soap_p 
      || wellnessData?.recommendations 
      || procedureData?.postOpCare 
      || '';
    
    const subjective = consult.soap_s 
      || wellnessData?.visitHeader 
      || consult.reason_for_visit 
      || '';

    const objective = consult.soap_o 
      || wellnessData?.physicalExamination 
      || '';

    // Prepare patient context
    const patientInfo = `${patient?.name || 'Patient'}, ${patient?.species || 'pet'}, ${patient?.breed || ''}, ${patient?.sex || ''}, ${patient?.age || ''}`.replace(/,\s*,/g, ',').replace(/,\s*$/, '');

    // Create AAHA-style educational content prompt
    const systemPrompt = `You are a veterinary client education specialist following AAHA (American Animal Hospital Association) guidelines. Generate comprehensive, evidence-based client education content that helps pet owners understand their pet's condition, treatment, and home care.

DO NOT use any markdown formatting (no **, *, #, ##, ###). Use plain text only with section headings followed by colons.

Structure your response with these exact sections:

1. WHAT IS THIS CONDITION?
Provide a clear, jargon-free explanation of the diagnosis or condition. Include:
- What is happening in the pet's body
- Why this condition occurs
- How common it is in this species/breed if relevant
- Use analogies that pet owners can easily understand

2. CAUSES AND RISK FACTORS:
Explain in simple terms:
- What may have caused this condition
- Risk factors that could have contributed
- Whether this is contagious to other pets or humans (if applicable)
- Breed or age predispositions if relevant

3. UNDERSTANDING THE TREATMENT:
Help the owner understand why specific treatments were chosen:
- Explain the purpose of each medication or treatment
- Why these specific treatments work for this condition
- What to expect during the treatment period
- How long treatment typically takes

4. WHAT TO EXPECT DURING RECOVERY:
Set realistic expectations:
- Typical recovery timeline
- Normal signs during recovery
- When improvement should be noticeable
- Potential setbacks and how to handle them

5. HOME CARE TIPS:
Provide practical, actionable advice:
- Step-by-step care instructions
- Environmental modifications if needed
- Diet and nutrition recommendations
- Activity guidelines
- Tips for administering medications

6. PREVENTION AND LONG-TERM CARE:
Help prevent recurrence:
- How to reduce risk of this condition recurring
- Lifestyle changes that may help
- Recommended preventive care
- When follow-up visits are needed

7. WHEN TO CONTACT YOUR VETERINARIAN:
Clear warning signs to watch for:
- Emergency symptoms requiring immediate care
- Signs that treatment isn't working
- Questions to ask at follow-up appointments

IMPORTANT GUIDELINES:
- Use warm, compassionate, reassuring language
- Avoid medical jargon - explain any necessary terms in plain language
- Be species-specific (dog vs cat vs other)
- Include breed-specific information when relevant
- Base recommendations on current AAHA guidelines and evidence-based veterinary medicine
- Be encouraging but realistic
- Format with plain bullet points using • character
- Keep paragraphs short and readable`;

    const userPrompt = `Generate AAHA-style client education content for:

Patient: ${patientInfo}

Diagnosis/Condition: ${diagnosis}

Clinical Findings:
${subjective}

${objective}

Treatment Plan:
${treatmentPlan}

Please provide comprehensive client education content covering all 7 sections to help the pet owner understand and manage their pet's condition.`;

    console.log('[LOVABLE-AI] Calling gateway for client education generation...');

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
          lastError = new Error(`API error: ${response.status}`);
          
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
          return new Response(JSON.stringify({ error: 'Failed to generate client education' }), {
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
      return new Response(JSON.stringify({ error: 'Failed to generate client education after multiple attempts' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const clientEducation = data.choices?.[0]?.message?.content;

    console.log('[LOVABLE-AI] Client education generated successfully, saving to database...');

    // Save client education to consults table
    const { error: updateError } = await supabase
      .from('consults')
      .update({ client_education: clientEducation })
      .eq('id', consultId);

    if (updateError) {
      console.error('Failed to save client education:', updateError);
      // Still return the generated content even if save fails
    }

    return new Response(JSON.stringify({ clientEducation }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-client-education function:', error);
    return new Response(JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
