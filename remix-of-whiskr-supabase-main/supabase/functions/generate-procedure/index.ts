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
    const rateLimitResponse = await withAIRateLimit(supabaseClient, user.id, 'generate_procedure', corsHeaders);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { consultId, transcription, patientInfo, regenerationInstruction, timezone, templateSections } = await req.json();
    
    // Use provided timezone or default to America/New_York
    const userTimezone = timezone || 'America/New_York';
    
    // Default all sections if none specified
    const allSections = [
      'procedureSummary', 'preProcedureAssessment', 'anestheticProtocol', 'procedureDetails',
      'medicationsAdministered', 'postProcedureStatus', 'followUpInstructions', 'clientCommunication', 'emailToClient'
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
          error: 'Insufficient clinical information provided. Please record or enter more details about the procedure before generating notes.',
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
      console.log('Using provided transcription for Procedure Notes generation');
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

    // Build dynamic section descriptions based on enabled sections
    const sectionDescriptions: Record<string, string> = {
      procedureSummary: '"procedureSummary": "Brief paragraph with procedure name, patient info, indication..."',
      preProcedureAssessment: '"preProcedureAssessment": "Bulleted list (•) of pre-anesthetic exam findings including TPR, BCS, MM, CRT, lab work review, ASA status, NPO status, IV catheter..."',
      anestheticProtocol: '"anestheticProtocol": "Bulleted list (•) with sub-items (-) for premedication, induction agents, maintenance, monitoring parameters..."',
      procedureDetails: '"procedureDetails": "Bulleted list (•) of procedural steps performed, findings, complications if any..."',
      medicationsAdministered: '"medicationsAdministered": "Bulleted list (•) organized by in-hospital medications and take-home medications with doses, routes..."',
      postProcedureStatus: '"postProcedureStatus": "Bulleted list (•) of recovery status, vital signs post-procedure, any immediate complications..."',
      followUpInstructions: '"followUpInstructions": "Bulleted list (•) of post-operative care instructions, activity restrictions, medication schedule..."',
      clientCommunication: '"clientCommunication": "Brief paragraph summarizing discussion with owner, prognosis, when to call..."',
      emailToClient: '"emailToClient": "Professional email format with greeting, body paragraphs summarizing procedure and aftercare, and sign-off..."'
    };
    
    const enabledSectionDescriptions = sectionsToGenerate
      .filter(s => sectionDescriptions[s])
      .map(s => sectionDescriptions[s])
      .join(',\n  ');

    let systemPrompt = `You are a veterinary medical assistant specializing in surgical and procedural documentation. Based on the conversation, generate comprehensive procedure notes.

IMPORTANT FORMATTING RULES:
• Do NOT use markdown formatting (no **, *, #, ##, ### symbols)
• Do NOT use asterisks or underscores for any emphasis
• Use plain text only - no special formatting characters
• Use plain bullet points (•) for all list items - no numbered lists (1. 2. 3.)
• Use dashes (-) for sub-items under bullet points
• Write in clear, professional medical language

SECTION-SPECIFIC FORMATTING REQUIREMENTS:
• procedureSummary: Brief paragraph format (1-2 sentences)
• preProcedureAssessment: MUST use bullet points (•) for each finding (TPR, BCS, MM, CRT, lab work, ASA status, NPO status, IV catheter)
• anestheticProtocol: MUST use bullet points (•) with sub-items (-) for each phase (premedication, induction, maintenance, monitoring)
• procedureDetails: MUST use bullet points (•) for each procedural step
• medicationsAdministered: MUST use bullet points (•) organized by in-hospital and take-home medications
• postProcedureStatus: MUST use bullet points (•) for recovery findings
• followUpInstructions: MUST use bullet points (•) for each home care instruction
• clientCommunication: Brief paragraph format
• emailToClient: Professional email with greeting, paragraphs, and sign-off

Format your response as valid JSON with this exact structure (ONLY include the sections listed below):
{
  ${enabledSectionDescriptions}
}

Be thorough and professional. Include all relevant procedural details from the conversation.
IMPORTANT: Only generate the sections listed above. Do NOT include any other sections.

DATE/TIME EXCLUSION RULE:
• Do NOT include any dates or times in the procedure notes output
• Skip procedure date, medication times, or timestamps
• If follow-up timing is discussed, use relative terms like "in 10-14 days" rather than specific dates
• NEVER include absolute dates in any section

CRITICAL ANTI-HALLUCINATION RULE:
If the provided conversation/transcription is empty, too short, contains only greetings, or lacks any clinical information about a procedure, you MUST respond with ONLY this JSON:
{"error": "INSUFFICIENT_CLINICAL_DATA", "message": "The provided input does not contain enough clinical information to generate accurate procedure notes. Please provide procedure details, patient information, or clinical observations."}

DO NOT make up patient names, species, breeds, procedure names, medications, or any clinical details. ONLY use information explicitly provided in the conversation. If no procedural data is present, return the error response above.`;

    // Add user chat notes as clinical context if any exist
    if (userChatNotes.length > 0) {
      systemPrompt += `\n\nCLINICAL DISCUSSION NOTES FROM CHAT:
The following notes were provided by the clinician during case discussion. Incorporate any constraints, preferences, or clinical decisions mentioned:

`;
      userChatNotes.forEach((note, index) => {
        systemPrompt += `${index + 1}. "${note}"\n`;
      });
      
      systemPrompt += `
When writing your procedure notes:
- Look for any owner constraints, budget limitations, or equipment limitations mentioned
- Incorporate any treatment preferences or procedural decisions discussed
- Modify follow-up instructions to accommodate any limitations mentioned`;
    }

    // Add regeneration instruction if provided
    if (regenerationInstruction) {
      systemPrompt += `\n\nIMPORTANT - USER REGENERATION REQUEST:
The user wants you to regenerate the notes with these specific changes:
"${regenerationInstruction}"

Please apply these modifications while maintaining clinical accuracy and the required JSON format.`;
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('[LOVABLE-AI] Generating procedure notes');

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
      throw new Error('Failed to generate procedure notes');
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    // Parse JSON from response (handle various markdown formats)
    let procedure: Record<string, string>;
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
      
      procedure = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse procedure JSON:', content);
      // Provide fallback structure with only enabled sections
      procedure = {};
      sectionsToGenerate.forEach(section => {
        procedure[section] = section === 'procedureSummary' ? (content || 'Unable to parse response') : '';
      });
    }
    
    // Filter response to only include enabled sections
    const filteredProcedure: Record<string, string> = {};
    sectionsToGenerate.forEach(section => {
      filteredProcedure[section] = procedure[section] || '';
    });

    // Check if AI returned an error response
    if (procedure.error === 'INSUFFICIENT_CLINICAL_DATA') {
      return new Response(
        JSON.stringify({ 
          error: procedure.message || 'Insufficient clinical information to generate procedure notes.',
          code: 'INSUFFICIENT_INPUT'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if all content fields are empty (AI couldn't generate meaningful content)
    const hasAnyContent = Object.values(filteredProcedure).some(value => 
      typeof value === 'string' && value.trim().length > 0
    );

    if (!hasAnyContent) {
      console.log("AI returned empty procedure notes - treating as insufficient data");
      return new Response(
        JSON.stringify({ 
          error: 'The transcription does not contain procedure-related information. Please ensure you have recorded or entered details about a surgical or procedural case.',
          code: 'INSUFFICIENT_INPUT'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ procedure: filteredProcedure }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in generate-procedure function:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
