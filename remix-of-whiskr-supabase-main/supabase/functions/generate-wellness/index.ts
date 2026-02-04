import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const envAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const envPub = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';
    const headerKey = req.headers.get('apikey') ?? '';
    const supabaseKey = envAnon || envPub || headerKey;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    });

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check rate limit for AI function
    const rateLimitResponse = await withAIRateLimit(supabaseClient, user.id, 'generate_wellness', corsHeaders);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { consultId, transcription, patientInfo, regenerationInstruction, timezone, templateSections } = await req.json();
    
    // Use provided timezone or default to America/New_York
    const userTimezone = timezone || 'America/New_York';
    
    // Default all sections if none specified  
    const allSections = [
      'patientInformation', 'vitalsWeightManagement', 'physicalExamination', 'assessment',
      'vaccinesAdministered', 'preventiveCareStatus', 'dietNutrition', 'ownerDiscussion',
      'recommendations', 'clientEducation'
    ];
    const sectionsToGenerate: string[] = templateSections && templateSections.length > 0 ? templateSections : allSections;

    if (!consultId && !transcription) {
      throw new Error('consultId or transcription is required');
    }

    // Validate transcription has sufficient content to prevent hallucination
    const cleanedTranscription = transcription?.trim();
    if (cleanedTranscription !== undefined && cleanedTranscription.length < 50) {
      console.log("Insufficient transcription content:", cleanedTranscription?.length || 0, "chars");
      return new Response(
        JSON.stringify({ 
          error: 'Insufficient clinical information provided. Please record or enter more details about the wellness visit before generating a report.',
          code: 'INSUFFICIENT_INPUT'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch consultation date and user chat messages for context
    let consultDate = new Date().toISOString();
    let userChatNotes: string[] = [];
    
    if (consultId) {
      const { data: consultData } = await supabaseClient
        .from('consults')
        .select('created_at')
        .eq('id', consultId)
        .maybeSingle();
      
      if (consultData?.created_at) {
        consultDate = consultData.created_at;
      }
      
      // Fetch all user chat messages for context
      const { data: userMessages } = await supabaseClient
        .from('chat_messages')
        .select('content, created_at')
        .eq('consult_id', consultId)
        .eq('role', 'user')
        .order('created_at', { ascending: true });
      
      if (userMessages && userMessages.length > 0) {
        userChatNotes = userMessages.map(m => m.content);
        console.log('Found user chat messages for context:', userChatNotes.length);
      }
    }

    const formattedDate = new Date(consultDate).toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      timeZone: userTimezone,
    });

    let conversationHistory: { role: string; content: string }[] = [];

    if (transcription) {
      console.log('Using provided transcription for Wellness Report generation');
      conversationHistory = [{ role: 'user', content: transcription }];
    } else {
      const { data: messages, error: messagesError } = await supabaseClient
        .from('chat_messages')
        .select('role, content, created_at')
        .eq('consult_id', consultId)
        .order('created_at', { ascending: true });

      if (messagesError) throw messagesError;
      if (!messages || messages.length === 0) {
        throw new Error('No chat messages found for this consultation');
      }

      conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    }

    // Get normal ranges if patient info available
    let normalRangesData = null;
    let ageClass = 'adult';
    if (patientInfo) {
      try {
        const rangesResponse = await supabaseClient.functions.invoke('get-normal-ranges', {
          body: {
            species: patientInfo.species,
            breed: patientInfo.breed,
            dateOfBirth: patientInfo.date_of_birth
          }
        });
        if (rangesResponse.data) {
          normalRangesData = rangesResponse.data.normalRanges;
          ageClass = rangesResponse.data.ageClass;
        }
      } catch (rangesError) {
        console.error('Error fetching normal ranges:', rangesError);
      }
    }

    let systemPrompt = `You are a veterinary medical assistant specializing in wellness visit documentation. Based on the conversation, generate a comprehensive wellness report.

IMPORTANT FORMATTING RULES:
• Do NOT use markdown formatting (no **, *, #, ##, ### symbols)
• Do NOT use asterisks or underscores for any emphasis
• Use plain text only - no special formatting characters
• Use plain bullet points (•) for all list items and section headers - no numbered lists (1. 2. 3.)
• Use dashes (-) for sub-items under bullet points
• Write in clear, professional medical language`;

    if (normalRangesData && patientInfo) {
      const species = patientInfo.species || 'unknown';
      const breed = patientInfo.breed || '';
      systemPrompt += `\n\nFor this ${ageClass} ${species}${breed ? ' (' + breed + ')' : ''}, use these normal ranges:`;
      if (normalRangesData.heart_rate) {
        systemPrompt += `\n- Heart rate: ${normalRangesData.heart_rate.min}-${normalRangesData.heart_rate.max} ${normalRangesData.heart_rate.unit}`;
      }
      if (normalRangesData.respiratory_rate) {
        systemPrompt += `\n- Respiratory rate: ${normalRangesData.respiratory_rate.min}-${normalRangesData.respiratory_rate.max} ${normalRangesData.respiratory_rate.unit}`;
      }
      if (normalRangesData.temperature) {
        systemPrompt += `\n- Temperature: ${normalRangesData.temperature.min}-${normalRangesData.temperature.max} ${normalRangesData.temperature.unit}`;
      }
    }

// Build dynamic section descriptions based on enabled sections
const wellnessSectionDescriptions: Record<string, string> = {
  patientInformation: '"patientInformation": "Formatted with bullet points (•) for each data element - SEE DETAILED INSTRUCTIONS BELOW"',
  vitalsWeightManagement: '"vitalsWeightManagement": "Formatted with bullet points (•) for each vital sign - SEE DETAILED INSTRUCTIONS BELOW"',
  physicalExamination: '"physicalExamination": "Comprehensive head-to-tail examination findings - SEE DETAILED INSTRUCTIONS BELOW"',
  assessment: '"assessment": "Overall clinical assessment and summary of findings..."',
  vaccinesAdministered: '"vaccinesAdministered": "List of vaccines given with route, site, and manufacturer if mentioned. Do NOT include lot numbers or expiration dates. Set to empty string if no vaccines administered."',
  preventiveCareStatus: '"preventiveCareStatus": "Heartworm, flea/tick prevention status and recommendations..."',
  dietNutrition: '"dietNutrition": "Current diet, feeding recommendations, any dietary concerns. Set to empty string if no diet info discussed."',
  ownerDiscussion: '"ownerDiscussion": "Topics discussed with owner, concerns addressed..."',
  recommendations: '"recommendations": "Next steps, follow-up recommendations..."',
  clientEducation: '"clientEducation": "Educational points covered with the client..."'
};

const enabledWellnessDescriptions = sectionsToGenerate
  .filter(s => wellnessSectionDescriptions[s])
  .map(s => wellnessSectionDescriptions[s])
  .join(',\n  ');

systemPrompt += `\n\nFormat your response as valid JSON with this exact structure (ONLY include the sections listed below):
{
  ${enabledWellnessDescriptions}
}

IMPORTANT: Only generate the sections listed above. Do NOT include any other sections.

CONDITIONAL SECTIONS:
• If no diet information is discussed, set dietNutrition to empty string ""
• If no vaccines were administered, set vaccinesAdministered to empty string ""

PATIENT INFORMATION FORMATTING - CRITICAL INSTRUCTIONS:
The patientInformation section MUST be organized with bullet points (•) for each data element:
• Patient Name: [Name from conversation]
• Species: [Dog/Cat/etc.]
• Breed: [Breed from conversation]
• Age: [Age in years and months if available]
• Weight: [Weight in kg or lbs if mentioned]
• Owner: [Owner name if mentioned]
• Reason for Visit: [Reason for wellness examination]

VITALS & WEIGHT MANAGEMENT FORMATTING - CRITICAL INSTRUCTIONS:
The vitalsWeightManagement section MUST be organized with bullet points (•) for each vital sign:
• Weight: [Weight value with unit]
• Body Condition Score: [BCS value, e.g., 5/9]
• Temperature: [Temperature value with unit] OR if not measured: "Within normal limits (${normalRangesData?.temperature ? `${normalRangesData.temperature.min}-${normalRangesData.temperature.max}${normalRangesData.temperature.unit}` : '100.0-102.5°F'})"
• Heart Rate: [HR value in bpm] OR if not measured: "Within normal limits (${normalRangesData?.heart_rate ? `${normalRangesData.heart_rate.min}-${normalRangesData.heart_rate.max} ${normalRangesData.heart_rate.unit}` : '60-140 bpm'})"
• Respiratory Rate: [RR value in breaths/min] OR if not measured: "Within normal limits (${normalRangesData?.respiratory_rate ? `${normalRangesData.respiratory_rate.min}-${normalRangesData.respiratory_rate.max} ${normalRangesData.respiratory_rate.unit}` : '10-30 breaths/min'})"
• CRT: [CRT value] OR if not assessed: "Within normal limits (<2 seconds)"
• Mucous Membranes: [Color/description] OR if not assessed: "Normal (pink and moist)"
• Hydration Status: [Status if mentioned]

ASSESSMENT SECTION - CRITICAL INSTRUCTIONS:
Provide a concise clinical assessment summarizing:
• Overall health status of the patient
• Key findings from the examination
• Any concerns or areas requiring attention
• Clinical impressions

IMPORTANT: When a vital sign was NOT specifically measured or mentioned in the conversation:
- Use the format: "Within normal limits (min-max unit)" with the actual normal range for this patient
- Example: "Within normal limits (100.0-102.5°F)" for temperature
- This helps readers understand what "normal" means for this specific patient

For ABNORMAL vitals → wrap ONLY the abnormal value in [[double brackets]] AND include the normal range
Example: "• Temperature: [[103.8°F]] (normal: 100.0-102.5°F)"

PHYSICAL EXAMINATION FORMATTING - CRITICAL INSTRUCTIONS:
The physicalExamination section MUST be organized with bullet points (•) for each body system IN THIS EXACT ORDER.
Use these DEFAULT NORMAL values if a body system was NOT specifically mentioned in the conversation:

• General Appearance: Bright, alert, responsive. Normal body condition and mentation. Ambulatory without assistance.
• Hydration Status: Mucous membranes moist, capillary refill time <2 seconds, skin turgor normal.
• Integument (Skin/Coat): Skin clean, free of lesions, parasites, or alopecia. Hair coat glossy and uniform.
• Eyes: Clear, no discharge or redness. Pupils equal, round, and responsive to light. No evidence of pain or opacity.
• Ears: Clean pinnae and canals. No discharge, odor, erythema, or pain on palpation.
• Nose: Moist and clean, no nasal discharge or ulceration.
• Oral Cavity: Mucous membranes pink and moist. No dental tartar, gingivitis, or oral masses. Tongue and palate normal.
• Throat (Pharynx/Larynx): No coughing, gagging, or abnormal sounds. No palpable abnormalities.
• Lymph Nodes: Submandibular, prescapular, and popliteal lymph nodes palpable and symmetrical; normal in size and consistency.
• Cardiovascular System: Heart sounds normal. No murmurs, arrhythmias, or pulse deficits. Pulses strong and synchronous.
• Respiratory System: Normal respiratory effort. Clear lung sounds bilaterally. No coughing, wheezing, or crackles.
• Abdomen: Soft, non-painful on palpation. No organomegaly, distension, or palpable masses. Normal intestinal sounds.
• Gastrointestinal System: No vomiting, diarrhea, or melena reported. Normal appetite and stool consistency.
• Genitourinary System: External genitalia normal. No discharge, swelling, or pain. Normal urination reported.
• Musculoskeletal System: Normal gait and posture. No lameness, joint swelling, or muscle atrophy noted.
• Neurologic System: Mentation normal. Gait coordinated.
• Rectal Exam: Not performed.

CRITICAL PHYSICAL EXAM REQUIREMENTS:
1. ALWAYS include ALL 17 body systems listed above in the physicalExamination section
2. If a body system was examined and had SPECIFIC findings mentioned → use those actual findings
3. If a body system was NOT mentioned or examined → use the default normal finding provided above
4. NEVER skip any body system - all 17 must be present
5. For ABNORMAL findings → wrap ONLY the abnormal value in [[double brackets]]
   Example: "• Eyes: [[Mild conjunctival hyperemia noted bilaterally]]. Pupils equal, round, and responsive to light."

CRITICAL - NEVER USE GENERIC TERMS:
- Do NOT use "Unremarkable", "WNL", "Within normal limits", "Normal", or "NSF" for any body system in the Physical Examination
- Each body system MUST have a descriptive finding - either the actual clinical finding OR the EXACT template text from above
- Example WRONG: "• Eyes: Unremarkable."
- Example RIGHT: "• Eyes: Clear, no discharge or redness. Pupils equal, round, and responsive to light. No evidence of pain or opacity."
- If no abnormalities were found for a body system, COPY the EXACT default text provided above for that system

Be thorough and professional. Extract all relevant wellness information from the conversation.

DATE/TIME EXCLUSION RULE:
• Do NOT include any dates or times in the wellness report output
• Skip visit date, vaccination dates, or timestamps
• If follow-up timing is discussed, use relative terms like "in 1 year" rather than specific dates
• NEVER include absolute dates in any section

CRITICAL ANTI-HALLUCINATION RULE:
If the provided conversation/transcription is empty, too short, contains only greetings, or lacks any clinical information about a wellness visit, you MUST respond with ONLY this JSON:
{"error": "INSUFFICIENT_CLINICAL_DATA", "message": "The provided input does not contain enough clinical information to generate an accurate wellness report. Please provide examination findings, patient history, or clinical observations."}

DO NOT make up patient names, species, breeds, examination findings, vaccines, or any clinical details. ONLY use information explicitly provided in the conversation. If no wellness data is present, return the error response above.`;

    // Add user chat notes as clinical context if any exist
    if (userChatNotes.length > 0) {
      systemPrompt += `\n\nCLINICAL DISCUSSION NOTES FROM CHAT:
The following notes were provided by the clinician during case discussion. Incorporate any constraints, preferences, or clinical decisions mentioned:

`;
      userChatNotes.forEach((note, index) => {
        systemPrompt += `${index + 1}. "${note}"\n`;
      });
      
      systemPrompt += `
When writing your wellness report:
- Look for any owner constraints, budget limitations, or equipment limitations mentioned
- Incorporate any treatment preferences or diagnostic decisions discussed
- Modify recommendations to accommodate any limitations mentioned`;
    }

    // Add regeneration instruction if provided
    if (regenerationInstruction) {
      systemPrompt += `\n\nIMPORTANT - USER REGENERATION REQUEST:
The user wants you to regenerate the report with these specific changes:
"${regenerationInstruction}"

Please apply these modifications while maintaining clinical accuracy and the required JSON format.`;
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('[LOVABLE-AI] Generating wellness report');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
          }))
        ],
        max_tokens: 8192,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[LOVABLE-AI] Gateway error:', response.status, error);
      if (response.status === 429) {
        throw new Error('Rate limits exceeded, please try again later.');
      }
      if (response.status === 402) {
        throw new Error('Payment required, please add funds to your Lovable AI workspace.');
      }
      throw new Error('Failed to generate wellness report');
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    // Parse JSON from response (handle various markdown formats)
    let wellness: Record<string, string>;
    try {
      let jsonStr = content.trim();
      
      // Remove markdown code blocks if present (various formats)
      const jsonBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonBlockMatch) {
        jsonStr = jsonBlockMatch[1].trim();
      } else {
        // If no code blocks, try to find raw JSON object
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }
      }
      
      // Fix unescaped newlines within JSON string values
      // This regex finds content between quotes and escapes literal newlines
      jsonStr = jsonStr.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match: string) => {
        // Replace literal newlines/carriage returns with escaped versions
        return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
      });
      
      wellness = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse wellness JSON:', content);
      // Provide fallback structure with only enabled sections
      wellness = {};
      sectionsToGenerate.forEach(section => {
        if (section === 'vitalsWeightManagement') {
          wellness[section] = content || 'Unable to parse response';
        } else {
          wellness[section] = '';
        }
      });
    }
    
    // Filter response to only include enabled sections
    const filteredWellness: Record<string, string> = {};
    sectionsToGenerate.forEach(section => {
      filteredWellness[section] = wellness[section] || '';
    });

    // Check if AI returned an error response
    if (wellness.error === 'INSUFFICIENT_CLINICAL_DATA') {
      return new Response(
        JSON.stringify({ 
          error: wellness.message || 'Insufficient clinical information to generate wellness report.',
          code: 'INSUFFICIENT_INPUT'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if all content fields are empty (AI couldn't generate meaningful content)
    const hasAnyContent = Object.values(filteredWellness).some(value => 
      typeof value === 'string' && value.trim().length > 0
    );

    if (!hasAnyContent) {
      console.log("AI returned empty wellness report - treating as insufficient data");
      return new Response(
        JSON.stringify({ 
          error: 'The transcription does not contain wellness visit information. Please ensure you have recorded or entered details about a wellness examination.',
          code: 'INSUFFICIENT_INPUT'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ wellness: filteredWellness }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in generate-wellness function:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
