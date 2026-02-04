import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { withAIRateLimit } from '../_shared/aiRateLimiter.ts';
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
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
    const rateLimitResponse = await withAIRateLimit(supabaseClient, user.id, 'generate_client_email', corsHeaders);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { consultId, visitType } = await req.json();

    if (!consultId) {
      throw new Error('consultId is required');
    }

    console.log('Generating client email for consult:', consultId, 'visit type:', visitType);

    // Get consultation minimal details first
    const { data: consult, error: consultError } = await supabaseClient
      .from('consults')
      .select('id, clinic_id, patient_id, reason_for_visit, weight_kg, weight_lb, vitals_temperature_f')
      .eq('id', consultId)
      .maybeSingle();

    if (consultError) {
      console.error('Error fetching consult:', consultError);
      throw consultError;
    }

    if (!consult) {
      throw new Error('Consultation not found');
    }

    // Fetch patient and owner details separately to avoid column mismatch issues
    const { data: patient, error: patientError } = await supabaseClient
      .from('patients')
      .select(`
        id,
        name,
        species,
        breed,
        sex,
        date_of_birth,
        owner:owners(name, email, phone)
      `)
      .eq('id', consult.patient_id)
      .maybeSingle();

    if (patientError) {
      console.error('Error fetching patient:', patientError);
      throw patientError;
    }

    if (!patient) {
      throw new Error('Patient not found for this consultation');
    }

    // Get all chat messages to use as context
    const { data: messages, error: messagesError } = await supabaseClient
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('consult_id', consultId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
    }

    // Calculate patient age
    const calculateAge = (birthDate: string) => {
      const birth = new Date(birthDate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      return age;
    };

    const patientAge = patient.date_of_birth ? calculateAge(patient.date_of_birth) : null;
    const ownerRel = (patient as any).owner;
    const ownerObj = Array.isArray(ownerRel) ? ownerRel[0] : ownerRel;
    const ownerName = ownerObj?.name || 'Owner';
    const ownerEmail = ownerObj?.email || '';
    const ownerPhone = ownerObj?.phone || '';

    // Build context from messages
    let consultContext = '';
    if (messages && messages.length > 0) {
      consultContext = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n\n');
    }

    let systemPrompt = '';
    let userPrompt = '';

    if (visitType === 'wellness' || visitType === 'vaccine') {
      // Wellness visit email
      systemPrompt = `You are a veterinary assistant writing a friendly, informative wellness visit summary email to a pet owner.

Key Guidelines:
- Warm, reassuring tone
- Summarize what was done during the visit
- Highlight any vaccines given with key details
- Mention any recommendations or follow-ups
- Keep it concise (2-3 short paragraphs)
- DO NOT use absolute language like "exact", "guaranteed", "always"
- Use qualified language like "recommended", "may help", "suggested"

Format: Plain text, professional but friendly.`;

      userPrompt = `Generate a wellness visit summary email for:

Patient: ${patient.name}
Species: ${patient.species}
Breed: ${patient.breed}
Age: ${patientAge || 'not recorded'}
Sex: ${patient.sex}
Owner: ${ownerName}

Visit Information:
${consult.reason_for_visit || 'Wellness examination'}

${consult.weight_kg ? `Weight: ${consult.weight_kg} kg (${consult.weight_lb} lb)` : ''}
${consult.vitals_temperature_f ? `Temperature: ${consult.vitals_temperature_f}°F` : ''}

${consultContext ? `\nConsultation Details:\n${consultContext}` : ''}

Generate a friendly wellness visit summary email that reassures the owner and provides key information.`;

    } else if (visitType === 'procedure') {
      // Procedure summary email
      systemPrompt = `You are a veterinary assistant writing a clear, informative post-procedure email to a pet owner.

Key Guidelines:
- Empathetic, professional tone
- Explain what procedure was performed
- Provide clear aftercare instructions
- Mention any medications or follow-up needed
- Address potential concerns proactively
- Keep organized with bullet points for instructions
- DO NOT use absolute language like "exact", "guaranteed", "will cure"
- Use qualified language like "should help", "may experience", "aim to"

Format: Plain text with clear sections and bullet points where helpful.`;

      userPrompt = `Generate a post-procedure summary email for:

Patient: ${patient.name}
Species: ${patient.species}
Breed: ${patient.breed}
Age: ${patientAge || 'not recorded'}
Sex: ${patient.sex}
Owner: ${ownerName}

Procedure Information:
${consult.reason_for_visit || 'Procedure performed'}

${consult.weight_kg ? `Weight: ${consult.weight_kg} kg (${consult.weight_lb} lb)` : ''}

${consultContext ? `\nProcedure Details:\n${consultContext}` : ''}

Generate a comprehensive post-procedure email with clear aftercare instructions.`;

    } else {
      // Standard visit (sickness, emergency, chronic)
      systemPrompt = `You are a veterinary assistant writing a clear, empathetic discharge email to a pet owner after their pet's visit.

Key Guidelines:
- Compassionate, professional tone
- Explain the diagnosis or findings clearly
- Provide treatment plan and medication instructions
- Include important home care guidance
- Mention when to return or seek emergency care
- Keep well-organized with sections
- DO NOT use absolute language like "exact cause", "guaranteed outcome", "will cure"
- Use qualified language like "possible diagnosis", "may help", "aim to manage"

Format: Plain text with clear sections (Dear Owner, Visit Summary, Treatment Plan, Home Care, When to Call).`;

      userPrompt = `Generate a discharge email for:

Patient: ${patient.name}
Species: ${patient.species}
Breed: ${patient.breed}
Age: ${patientAge || 'not recorded'}
Sex: ${patient.sex}
Owner: ${ownerName}

Visit Reason:
${consult.reason_for_visit || 'Medical consultation'}

${consult.weight_kg ? `Weight: ${consult.weight_kg} kg (${consult.weight_lb} lb)` : ''}
${(consult as any).vitals_temperature_f ? `Temperature: ${(consult as any).vitals_temperature_f}°F` : ''}

${consultContext ? `\nConsultation Details:\n${consultContext}` : ''}

Generate a comprehensive discharge email with clear instructions and guidance for the pet owner.`;
    }

    console.log('[GEMINI-3-FLASH] Generating client email...');

    const result = await callGemini({
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.7,
      maxTokens: 1000,
      model: GEMINI_MODEL,
    });

    const emailContent = result.content.trim();

    console.log('[GEMINI-3-FLASH] Email generated successfully');

    return new Response(
      JSON.stringify({ emailContent }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in generate-client-email function:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
