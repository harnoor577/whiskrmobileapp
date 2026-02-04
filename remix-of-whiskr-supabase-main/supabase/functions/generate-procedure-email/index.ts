import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check rate limit for AI function
    const rateLimitResponse = await withAIRateLimit(supabase, user.id, 'generate_procedure_email', corsHeaders);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { consultId, recipientEmail, vetName, clinicInfo } = await req.json();

    if (!consultId || !recipientEmail) {
      return new Response(JSON.stringify({ error: 'consultId and recipientEmail are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the consult data with procedure notes
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

    // Fetch the latest assistant message (procedure notes)
    const { data: messages, error: msgError } = await supabase
      .from('chat_messages')
      .select('content')
      .eq('consult_id', consultId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1);

    const procedureNotes = messages && messages.length > 0 ? messages[0].content : 'Not available';

    // Calculate patient age
    let patientAge = 'not recorded';
    if (patient?.date_of_birth) {
      const birthDate = new Date(patient.date_of_birth);
      const today = new Date();
      const ageYears = Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      const ageMonths = today.getMonth() - birthDate.getMonth();
      if (ageYears > 0) {
        patientAge = `${ageYears} year${ageYears > 1 ? 's' : ''}`;
      } else if (ageMonths > 0) {
        patientAge = `${ageMonths} month${ageMonths > 1 ? 's' : ''}`;
      }
    }

    // Determine procedure type and outcome from the notes
    const procedureType = consult.reason_for_visit || 'Procedure';
    
    // Check for critical/euthanasia keywords
    const notesLower = procedureNotes.toLowerCase();
    const isEuthanasia = notesLower.includes('euthanasia') || notesLower.includes('passed peacefully') || notesLower.includes('cross peacefully');
    const isCritical = notesLower.includes('complication') || notesLower.includes('guarded') || notesLower.includes('critical');
    const isRoutine = !isEuthanasia && !isCritical;

    // Create the AI prompt based on the veterinary clinical assistant template
    const systemPrompt = `You are a veterinary clinical assistant responsible for writing post-procedure summary emails to clients on behalf of the attending doctor.

Your tone, structure, and emotional warmth must adapt based on the procedure type and outcome.

Use the following rules and structure:

1. SUBJECT LINE:

Format as: "[Patient Name]'s [Procedure Type] – Procedure Summary"

If the case was critical or did not go as expected, use softer wording such as:
"Update on [Patient Name]'s Procedure" or "[Patient Name]'s Surgery – Postoperative Update."

For euthanasia cases, use: "In Loving Memory of [Patient Name]"

2. OPENING GREETING:

Routine or successful case → "Hi [Client Name]," or "Hello [Client Name],"

Critical or complex case → "Dear [Client Name],"

Euthanasia case → "Dear [Client Name]," (tone warm and heartfelt)

3. BODY STRUCTURE:

A. Start with a short summary of what happened:

Example (Routine): "Luna's dental cleaning and evaluation were performed today under general anesthesia. She did great throughout the procedure."

Example (Surgical): "Daisy's mass removal went smoothly today, and she recovered well from anesthesia."

Example (Critical/Emergency): "Bella's surgery was completed today. The procedure was complex, but she is currently stable and under close observation."

Example (Euthanasia): "Today was an incredibly difficult day as we helped [Patient Name] cross peacefully. We know how loved they were and how hard this goodbye is."

B. Provide findings or actions taken:

Mention what was done (cleaning, mass removal, stabilization, etc.).

If complications occurred, acknowledge them factually but gently:
"During the procedure, we found [finding]. There was a mild complication, but we addressed it promptly, and [Patient Name] is recovering as expected."
OR
"Unfortunately, [Patient Name]'s condition was more severe than anticipated. We provided supportive care throughout, but the prognosis remains guarded."

C. Recovery status and care instructions:

Successful case → "She's resting comfortably and should return to normal within 24 hours."

Complicated recovery → "She remains hospitalized for monitoring and IV support. We'll keep you updated as her condition changes."

Euthanasia → Replace this section with emotional closure: "She passed peacefully, surrounded by love, without pain or fear. Please know we're thinking of you during this time."

D. Home care and recheck guidance:

Include concise bullet points for care, medication, or recheck timelines.

For simple cases, mention routine follow-up or next cleaning.

For complex cases, give clear instructions on signs that require urgent attention.

E. Emotional closing and reassurance:

Routine → "She did great today!" or "Thank you for trusting us with her care."

Complex → "We'll continue to monitor her closely and keep you updated."

Euthanasia → "Our hearts are with you. [Patient Name] was a very special patient, and it was an honor to care for them."

4. SIGN-OFF:

Always end with:
"Warm regards," or "Sincerely,"
Dr. ${vetName || '[Doctor Name]'}
${clinicInfo?.name || 'GrowDVM'}
${clinicInfo?.address || '[Clinic Address]'}
${clinicInfo?.phone || '[Clinic Phone]'}
${clinicInfo?.clinic_email || '[Clinic Email]'}

5. STYLE RULES:

Write in clear, empathetic, natural language — no jargon.

Avoid heavy medical terminology unless needed for clarity.

Adapt the emotional tone to match the situation:

Routine wellness or dental = professional + cheerful

Surgery (normal) = confident + caring

Complication = calm + compassionate

Euthanasia = heartfelt + gentle

Keep the total message under 250 words unless medically complex.

IMPORTANT: Generate ONLY the email body content (greeting through sign-off). Do NOT include the subject line in the body. The subject line will be handled separately.`;

    const userPrompt = `Generate a post-procedure email for:

Patient: ${patient?.name}, ${patient?.species}, ${patient?.breed || 'mixed breed'}, ${patientAge}, ${patient?.sex || 'unknown sex'}
Client Name: ${owner?.name || 'the client'}
Procedure Type: ${procedureType}

Procedure Notes:
${procedureNotes}

Additional Context:
${isEuthanasia ? 'This is a euthanasia case - use heartfelt, compassionate tone.' : ''}
${isCritical ? 'This case had complications - use calm, compassionate tone.' : ''}
${isRoutine ? 'This was a routine procedure - use professional, cheerful tone.' : ''}

Generate the email body following the structure above. Do NOT include a subject line in the body.`;

    console.log('[GEMINI-3-FLASH] Generating procedure email...');

    const result = await callGemini({
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.8,
      maxTokens: 1500,
      model: GEMINI_MODEL,
    });

    const emailBody = result.content;

    // Generate subject line based on case type
    let subjectLine = '';
    if (isEuthanasia) {
      subjectLine = `In Loving Memory of ${patient?.name}`;
    } else if (isCritical) {
      subjectLine = `Update on ${patient?.name}'s Procedure`;
    } else {
      subjectLine = `${patient?.name}'s ${procedureType} – Procedure Summary`;
    }

    console.log('Procedure email generated successfully');

    return new Response(JSON.stringify({ 
      emailBody,
      subjectLine,
      procedureType: isEuthanasia ? 'euthanasia' : (isCritical ? 'critical' : 'routine')
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-procedure-email function:', error);
    return new Response(JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
