import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { withAIRateLimit } from '../_shared/aiRateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase credentials');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify user authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message || 'No user found');
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    // Check rate limit for AI function
    const rateLimitResponse = await withAIRateLimit(supabaseClient, user.id, 'analyze_recording', corsHeaders);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { transcription, patientInfo, consultId, followUpQuestion, previousMessages } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build the system prompt for Atlas
    const systemPrompt = `You are Atlas, an AI veterinary assistant. Your role is to analyze case recordings and provide clinical insights.

Your style:
- Professional and clinical
- Use clear, precise medical language
- Stick strictly to case-relevant information only
- Do NOT include greetings, encouraging notes, or sign-offs
- Do NOT ask follow-up questions at the end of responses
- Never include salutations or closing remarks
- Output only clinical information relevant to the case

IMPORTANT FORMATTING RULES:
- Do NOT use markdown formatting (no **, *, #, ##, ### symbols)
- Do NOT use asterisks or underscores for emphasis
- Use numbered lists (1. 2. 3.) for sequential items
- Use plain bullet points (•) for lists, not dashes or asterisks
- Use plain text with clear section headers followed by colons
- Use line breaks to separate sections
- Keep formatting simple and clean

When analyzing a case initially (no specific request):

Case Summary:
Provide a clear, concise summary of the key findings from the recording. Include:
• Patient presentation and chief complaint
• Relevant history mentioned
• Physical examination findings noted
• Any vitals or measurements mentioned
• Owner concerns or constraints

Keep it informative but brief. Do NOT include differential diagnoses, recommended diagnostics, treatment plans, or procedures in this initial summary. Do NOT add any closing remarks or offers to help.

When asked for Differential Diagnoses:
Provide your response in two clearly separated sections with headings:

Differential Diagnoses:
Provide 7-8 differential diagnoses ranked by likelihood. For each diagnosis, include:
• The diagnosis name
• A brief explanation of why it fits this case
• Key clinical signs that support this diagnosis

IMPORTANT: Do NOT include any diagnostic plans or tests under individual diagnoses. List ALL diagnoses first before the Diagnostic Plan section.

Diagnostic Plan:
After listing ALL differential diagnoses above, provide a comprehensive diagnostic plan to confirm or rule out the differentials. Include:
• Recommended laboratory tests (bloodwork, urinalysis, etc.)
• Imaging studies if indicated (radiographs, ultrasound, etc.)
• Any other diagnostic procedures
• Priority order for running diagnostics (which tests to run first)

When asked for Treatment Plan:
Provide a comprehensive treatment plan organized with these subsections (use plain text, no markdown):

1. Medications (if applicable):
   • Drug name, dose, route, frequency, duration for each medication
   • Example: "Amoxicillin-Clavulanate 125mg PO BID x 14 days"
   • Skip this section entirely if no medications are being prescribed

2. Diet & Nutrition:
   • Dietary changes or restrictions
   • Feeding schedule modifications
   • Caloric recommendations if relevant

3. Activity Restrictions:
   • Exercise limitations and duration
   • Environmental modifications
   • Confinement requirements

4. Home Care Instructions:
   • Wound care if applicable
   • Medication administration tips
   • Monitoring parameters for owner

5. Follow-up Schedule:
   • Specific recheck appointments with timeframes
   • Conditions warranting earlier return

6. Prognosis:
   • Expected outcome (excellent/good/guarded/poor)
   • Recovery timeline

7. Warning Signs (When to Return Immediately):
   • Emergency symptoms to watch for
   • Critical signs requiring immediate veterinary attention

IMPORTANT: Do NOT include diagnostic recommendations in the treatment plan - diagnostics belong in the Differential Diagnosis response only.

When asked for Wellness suggestions:
Provide wellness care recommendations including preventive care, vaccinations, nutrition, dental care, and lifestyle recommendations appropriate for the patient.

When asked for Procedure suggestions:
Analyze the case and identify the SINGLE MOST RELEVANT procedure. Provide a comprehensive plan:

1. Recommended Procedure:
   • Name and why this is the most appropriate choice
   • Brief mention of alternatives considered

2. Pre-Procedure Requirements:
   • Pre-anesthetic assessment and lab work needed
   • NPO status and preparation

3. Anesthetic Considerations:
   • Premedication, induction, maintenance
   • Monitoring and patient-specific concerns

4. Procedure Overview:
   • Step-by-step description
   • Equipment and expected duration

5. Post-Procedure Care:
   • Recovery monitoring and pain management
   • Activity restrictions

6. Follow-Up:
   • Recheck schedule and home care
   • Warning signs for owner

${patientInfo ? `Patient Information:
• Patient ID: ${patientInfo.patientId}
• Name: ${patientInfo.name}
• Species: ${patientInfo.species}` : ''}`;

    // Build messages array
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // If this is the initial analysis
    if (!followUpQuestion) {
      messages.push({
        role: 'user',
        content: `Please analyze this veterinary case recording and provide a case summary only:

Recording Transcription:
${transcription}

Provide a friendly, helpful case summary based on the recording. Do not include differential diagnoses, treatment plans, or procedures - only summarize the key findings.`,
      });
    } else {
      // This is a follow-up question
      // Add previous messages for context
      if (previousMessages && previousMessages.length > 0) {
        for (const msg of previousMessages) {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      }

      // Add the original transcription context if available
      if (transcription) {
        messages.push({
          role: 'user',
          content: `[Context from recording: ${transcription.slice(0, 500)}${transcription.length > 500 ? '...' : ''}]

${followUpQuestion}`,
        });
      } else {
        messages.push({
          role: 'user',
          content: followUpQuestion,
        });
      }
    }

    console.log('[analyze-recording] Calling AI with', messages.length, 'messages');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[analyze-recording] AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content;

    if (!analysis) {
      throw new Error('No analysis generated');
    }

    console.log('[analyze-recording] Analysis generated successfully');

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[analyze-recording] Error:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
