import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { withAIRateLimit } from '../_shared/aiRateLimiter.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Convert nested object to readable text
function formatObjectToText(obj: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [category, content] of Object.entries(obj)) {
    const categoryTitle = category
      .replace(/_/g, " ")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    lines.push(`${categoryTitle}:`);

    if (typeof content === "object" && content !== null) {
      for (const [key, value] of Object.entries(content as Record<string, unknown>)) {
        const keyName = key.replace(/_/g, " ");
        if (typeof value === "object" && value !== null) {
          for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
            lines.push(`  • ${subKey.replace(/_/g, " ")}: ${subValue}`);
          }
        } else {
          lines.push(`  • ${keyName}: ${value}`);
        }
      }
      lines.push("");
    } else {
      lines.push(`  ${content}`);
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const envAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const envPub = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    const headerKey = req.headers.get("apikey") ?? "";
    const supabaseKey = envAnon || envPub || headerKey;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: req.headers.get("Authorization")! },
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
    const rateLimitResponse = await withAIRateLimit(supabaseClient, user.id, 'generate_soap', corsHeaders);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { consultId, transcription, patientInfo, regenerationInstruction, timezone, templateSections } = await req.json();
    
    // Use provided timezone or default to America/New_York
    const userTimezone = timezone || 'America/New_York';
    
    // Default all sections if none specified
    const allSections = ['subjective', 'objective', 'assessment', 'plan'];
    const sectionsToGenerate: string[] = templateSections && templateSections.length > 0 ? templateSections : allSections;

    // Either consultId or transcription is required
    if (!consultId && !transcription) {
      throw new Error("consultId or transcription is required");
    }

    // Validate transcription has sufficient content to prevent hallucination
    const cleanedTranscription = transcription?.trim();
    if (cleanedTranscription !== undefined && cleanedTranscription.length < 50) {
      console.log("Insufficient transcription content:", cleanedTranscription?.length || 0, "chars");
      return new Response(
        JSON.stringify({ 
          error: 'Insufficient clinical information provided. Please record or enter more details about the consultation before generating SOAP notes.',
          code: 'INSUFFICIENT_INPUT'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let consult = null;
    let conversationHistory: { role: string; content: string }[] = [];
    
    // Fetch consultation date from database
    let consultDate = new Date().toISOString();
    if (consultId) {
      const { data: consultDateData } = await supabaseClient
        .from('consults')
        .select('created_at')
        .eq('id', consultId)
        .maybeSingle();
      
      if (consultDateData?.created_at) {
        consultDate = consultDateData.created_at;
      }
    }
    
    const formattedDate = new Date(consultDate).toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      timeZone: userTimezone,
    });

    // If transcription is provided directly, use it
    if (transcription) {
      console.log("Using provided transcription for SOAP generation");
      conversationHistory = [{ role: "user", content: transcription }];

      // If patientInfo is provided, create a mock consult object
      if (patientInfo) {
        consult = {
          patient: {
            species: patientInfo.species,
            breed: patientInfo.breed,
            date_of_birth: patientInfo.date_of_birth,
          },
        };
      }
    } else {
      // Fall back to fetching from database
      console.log("Fetching consult data from database for consultId:", consultId);

      // Get consult with patient details including weight
      const { data: consultData, error: consultError } = await supabaseClient
        .from("consults")
        .select(
          `
          *,
          patient:patients (
            id,
            species,
            breed,
            date_of_birth,
            weight_kg,
            weight_lb
          )
        `,
        )
        .eq("id", consultId)
        .single();

      if (consultError) throw consultError;
      if (!consultData) throw new Error("Consult not found");
      consult = consultData;

      // Get chat messages for this consultation
      const { data: messages, error: messagesError } = await supabaseClient
        .from("chat_messages")
        .select("role, content, created_at")
        .eq("consult_id", consultId)
        .order("created_at", { ascending: true });

      if (messagesError) throw messagesError;

      if (!messages || messages.length === 0) {
        throw new Error("No chat messages found for this consultation");
      }

      // Build conversation history for AI
      conversationHistory = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
    }

    // Fetch all user chat messages for context (clinical discussion notes)
    let userChatNotes: string[] = [];
    if (consultId) {
      const { data: userMessages } = await supabaseClient
        .from("chat_messages")
        .select("content, created_at")
        .eq("consult_id", consultId)
        .eq("role", "user")
        .order("created_at", { ascending: true });

      if (userMessages && userMessages.length > 0) {
        userChatNotes = userMessages.map((m) => m.content);
        console.log("Found user chat messages for context:", userChatNotes.length);
      }
    }

    // Get normal ranges for this patient
    let normalRangesData = null;
    let ageClass = "adult";
    if (consult?.patient) {
      try {
        const rangesResponse = await supabaseClient.functions.invoke("get-normal-ranges", {
          body: {
            species: consult.patient.species,
            breed: consult.patient.breed,
            dateOfBirth: consult.patient.date_of_birth,
          },
        });

        if (rangesResponse.data) {
          normalRangesData = rangesResponse.data.normalRanges;
          ageClass = rangesResponse.data.ageClass;
          console.log("Retrieved normal ranges:", normalRangesData);
        }
      } catch (rangesError) {
        console.error("Error fetching normal ranges:", rangesError);
        // Continue without ranges if fetch fails
      }
    }

    // Build enhanced system prompt with normal ranges
    let systemPrompt = `You are a veterinary medical assistant. Based on the conversation, generate structured SOAP notes (Subjective, Objective, Assessment, Plan).

CRITICAL FORMAT REQUIREMENTS:
• Each section (subjective, objective, assessment, plan) MUST be a plain text STRING
• Do NOT use nested JSON objects for any section
• Do NOT use markdown formatting (no **, *, #, ##, ### symbols)
• Do NOT use asterisks or underscores for any emphasis
• Use plain text only - no special formatting characters
• Use plain bullet points (•) for all list items and section headers - no numbered lists (1. 2. 3.)
• Use dashes (-) for sub-items under bullet points
• Write in clear, professional medical language

SUBJECTIVE SECTION CONTENT RULES:
The Subjective section should contain ONLY:
• Chief complaint (reason for visit)
• Patient history and timeline of symptoms
• What the owner reported about the pet's condition BEFORE the examination
• Relevant past medical history
• Patient signalment (species, breed, age, weight, sex)

DO NOT include in Subjective:
• Owner education or discussions about diagnosis (goes in Plan → Owner Discussion)
• Treatment consent or option discussions (goes in Plan → Owner Discussion)
• Prognosis conversations (goes in Plan → Owner Discussion)
• Any communication that occurred AFTER the examination/assessment
• Statements like "owner was informed/educated/understands" (goes in Plan → Owner Discussion)

ABNORMAL VALUE FORMATTING (CRITICAL):
• For ABNORMAL findings, wrap ONLY the abnormal value in double brackets: [[value]]
• Example abnormal: "Heart rate: [[145 bpm]]"
• Example normal: "Temperature: 101.5°F"
• Do NOT include normal ranges in the output
• Do NOT write the word "ABNORMAL", "elevated", "decreased", or "(abnormal)" - just use the [[brackets]]
• The brackets tell our system to highlight it - no other markers needed

The Objective section MUST be organized with two clearly labeled sections:

1. "Vitals:" as a heading on its own line, followed by bullet points (•) for each vital sign.
   CRITICAL: ALWAYS include these core vitals in this order:
   • Temperature
   • Heart rate
   • Respiratory rate
   • Weight (if mentioned)
   • Body condition score (if mentioned)
   • CRT
   • Mucous membranes
   
   IMPORTANT VITALS RULE:
   - If the clinician provides a specific measured value, use that exact value
   - If the clinician describes a vital as "normal" without a specific value, OR if a vital is NOT MENTIONED AT ALL, assume it is normal and write: "Normal ([min]-[max] [unit])" using the patient-specific ranges provided below
   - Example for unmentioned/normal vitals: "Heart rate: Normal (60-100 bpm)"
   - NEVER leave core vitals blank - always include Temperature, Heart rate, Respiratory rate, CRT, and Mucous membranes

2. "Physical Examination:" as a heading on its own line, followed by bullet points (•) for each body system IN THIS EXACT ORDER:
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

CRITICAL REQUIREMENT - ALWAYS INCLUDE ALL 17 BODY SYSTEMS IN THE PHYSICAL EXAMINATION:
- You MUST include ALL 17 body systems listed above, in the exact order shown
- If a body system was examined and had specific findings, use those actual findings
- If a body system was NOT mentioned or examined, use the default normal finding provided in the template above
- Never skip any body system - a complete Physical Examination includes all 17 systems
- For abnormal findings, wrap the abnormal value in [[double brackets]] like: "Abdomen: [[Painful and tense on palpation]]"
- Format each as: "• [System Name]: [Actual findings or default normal finding]"

3. "Diagnostic Findings:" as a heading on its own line (ONLY IF DIAGNOSTICS WERE PROVIDED IN THE INPUT)
   
   Present findings as simple bullet-point summaries that are easy to understand:
   
   • Each bullet should summarize a key clinical finding in plain language
   • Focus on clinical significance, NOT raw lab values or parameters
   • Group related findings together when appropriate
   • Highlight abnormal findings with [[double brackets]] around the key concern
   
   Examples of CORRECT format:
   • Bloodwork indicates [[hepatobiliary disease]] with elevated liver enzymes
   • Mild azotemia present, consistent with dehydration
   • CBC within normal limits, no evidence of infection
   • Abdominal ultrasound shows [[hepatomegaly]] with diffuse changes
   • Radiographs unremarkable, no foreign body identified
   
   DO NOT list individual lab parameters with values (e.g., "BUN: 45 mg/dL")
   DO summarize what the results mean clinically in simple terms
   
   If NO diagnostics were provided in the input, SKIP this section completely

Do NOT use narrative paragraphs. Each heading should be on its own line followed by its bullet points.`;

    if (normalRangesData && consult.patient) {
      const species = consult.patient.species || "unknown";
      const breed = consult.patient.breed || "";
      const ageText = ageClass === "puppy" || ageClass === "kitten" ? `young ${ageClass}` : `${ageClass}`;

      systemPrompt += `\n\nFor this ${ageText} ${species}${breed ? " (" + breed + ")" : ""}, use these breed/age-specific normal ranges to determine if values are ABNORMAL:`;

      if (normalRangesData.heart_rate) {
        systemPrompt += `\n• Heart rate normal range: ${normalRangesData.heart_rate.min}-${normalRangesData.heart_rate.max} ${normalRangesData.heart_rate.unit}`;
      }
      if (normalRangesData.respiratory_rate) {
        systemPrompt += `\n• Respiratory rate normal range: ${normalRangesData.respiratory_rate.min}-${normalRangesData.respiratory_rate.max} ${normalRangesData.respiratory_rate.unit}`;
      }
      if (normalRangesData.temperature) {
        systemPrompt += `\n• Temperature normal range: ${normalRangesData.temperature.min}-${normalRangesData.temperature.max} ${normalRangesData.temperature.unit}`;
      }
      if (normalRangesData.crt) {
        systemPrompt += `\n• CRT normal: ${normalRangesData.crt.typical}`;
      }
      if (normalRangesData.mucous_membranes) {
        systemPrompt += `\n• Mucous membranes normal: ${normalRangesData.mucous_membranes.typical}`;
      }

      systemPrompt += `\n\nWhen writing vitals in the Objective section:
• If specific measured values were mentioned, use those exact values
• If vitals are described as "normal" without specific values, write "Normal ([min]-[max] [unit])" using the ranges above
• If vitals are NOT MENTIONED AT ALL, assume they are normal and write "Normal ([min]-[max] [unit])" using the ranges above
• Examples for unmentioned/normal vitals:
  - "Temperature: Normal (${normalRangesData.temperature?.min || 101.0}-${normalRangesData.temperature?.max || 102.5}${normalRangesData.temperature?.unit || '°F'})"
  - "Heart rate: Normal (${normalRangesData.heart_rate?.min || 60}-${normalRangesData.heart_rate?.max || 100} ${normalRangesData.heart_rate?.unit || 'bpm'})"
  - "Respiratory rate: Normal (${normalRangesData.respiratory_rate?.min || 10}-${normalRangesData.respiratory_rate?.max || 35} ${normalRangesData.respiratory_rate?.unit || 'breaths/min'})"
  - "CRT: Normal (${normalRangesData.crt?.typical || '<2 seconds'})"
  - "Mucous membranes: Normal (${normalRangesData.mucous_membranes?.typical || 'Pink and moist'})"
• If a value is OUTSIDE the normal range, wrap it in [[double brackets]]: "Heart rate: [[145 bpm]]"
• If a specific value is WITHIN normal range, write it plain: "Heart rate: 95 bpm"
• NEVER leave core vitals blank - Temperature, Heart rate, Respiratory rate, CRT, and Mucous membranes MUST always be present`;
    }

    // Get weight for dosing calculations
    // Priority: 1. Consult vitals (current visit), 2. Patient baseline
    let weightKg: number | null = null;
    let weightLb: number | null = null;
    
    if (consult) {
      // Check consult vitals first (current visit weight)
      if (consult.weight_kg) {
        weightKg = consult.weight_kg;
        weightLb = consult.weight_lb;
      }
      // Fall back to patient baseline weight
      else if (consult.patient?.weight_kg) {
        weightKg = consult.patient.weight_kg;
        weightLb = consult.patient.weight_lb;
      }
    }

    // Build medication dosing instructions based on weight availability
    let medicationDosingInstructions: string;
    if (weightKg) {
      medicationDosingInstructions = `Medications: (ONLY INCLUDE IF MEDICATIONS ARE ACTUALLY PRESCRIBED)
   If medications are being prescribed, list each with bullet points:
   
   WEIGHT-BASED DOSING REQUIRED:
   • Patient weight: ${weightKg} kg${weightLb ? ` (${weightLb} lb)` : ''}
   • Calculate all medication doses based on this weight using species-specific mg/kg guidelines
   • Format each medication as: "Drug name (dose mg/kg route frequency) → [calculated dose] mg per dose, give [practical dose] [frequency] x [duration]"
   • Example: "Carprofen (2 mg/kg PO BID) → ${(2 * weightKg).toFixed(1)} mg per dose, give one 25mg tablet twice daily x 5 days"
   • Round to clinically appropriate tablet sizes, capsule counts, or liquid volumes
   • Include route (PO, SC, IM, IV), frequency (BID, TID, SID, q12h, etc.), and duration
   
   IMPORTANT: If NO medications are being prescribed for this case, SKIP this entire Medications section - do not include it at all, not even as a placeholder.`;
    } else {
      medicationDosingInstructions = `Medications: (ONLY INCLUDE IF MEDICATIONS ARE ACTUALLY PRESCRIBED)
   If medications are being prescribed, list each with bullet points:
   • Drug name, standard mg/kg dose, route, frequency, duration
   
   WARNING: Patient weight not recorded. Verify weight before dispensing medications. Include standard mg/kg doses so the clinician can calculate the appropriate dose once weight is confirmed.
   
   IMPORTANT: If NO medications are being prescribed for this case, SKIP this entire Medications section - do not include it at all, not even as a placeholder.`;
    }

    systemPrompt += `\n\nThe Assessment section MUST be organized with bullet points for comprehensive clinical reasoning:

• Primary/Working Diagnosis: State the most likely diagnosis with brief clinical rationale
  - Include key findings that support this diagnosis
• Differential Diagnoses: List other conditions being considered
  - Each differential should include brief reasoning for why it's being considered
  - Order by likelihood (most to least likely)
• Clinical Reasoning: Summarize key findings that support the diagnosis
  - Connect clinical signs to pathophysiology
  - Explain why differentials were ruled in or out
• Rule-outs: List conditions that were considered but ruled out based on findings
  - Include brief reasoning for exclusion

Example of CORRECT assessment format:
"assessment": "• Primary Diagnosis: Acute gastroenteritis\\n  - Clinical signs of vomiting, diarrhea, and abdominal discomfort support this diagnosis\\n  - Onset consistent with dietary indiscretion history\\n\\n• Differential Diagnoses:\\n  - Pancreatitis (less likely given normal appetite and no cranial abdominal pain)\\n  - Foreign body ingestion (cannot rule out without imaging)\\n  - Inflammatory bowel disease (would expect chronic history)\\n\\n• Clinical Reasoning:\\n  - History of garbage ingestion 24 hours prior to symptom onset\\n  - Physical exam findings of mild abdominal tenderness without obstruction signs\\n  - Vital signs within normal limits suggesting no sepsis\\n  - Mild dehydration present (5%) but patient remains bright and responsive\\n\\n• Rule-outs:\\n  - Parvovirus (ruled out - patient is adult and fully vaccinated)\\n  - Hemorrhagic gastroenteritis (ruled out - no bloody diarrhea)"

The Plan section MUST be comprehensive and organized with plain headings (no bullets on headings) followed by bullet points for items. Use these subsections:

${medicationDosingInstructions}

Diagnostics Recommended:
   List any recommended tests with bullet points:
   • Bloodwork (CBC, chemistry panel, etc.)
   • Imaging (radiographs, ultrasound)
   • Other tests (urinalysis, cultures, etc.)

Diet & Nutrition: (ONLY INCLUDE IF SPECIFIC DIETARY CHANGES ARE RECOMMENDED)
   • Dietary changes or restrictions
   • Feeding schedule modifications
   • Caloric recommendations if relevant
   IMPORTANT: If there are NO specific dietary changes (e.g., just "continue current diet" or "no changes needed"), SKIP this entire section - do not include generic statements.

Activity Restrictions: (ONLY INCLUDE IF SPECIFIC RESTRICTIONS ARE REQUIRED)
   • Exercise limitations and duration
   • Environmental modifications
   • Confinement requirements
   IMPORTANT: If there are NO specific activity restrictions, SKIP this entire section - do not include generic statements like "no specific restrictions" or "normal activity permitted."

Home Care Instructions:
   • Wound care if applicable
   • Medication administration tips
   • Monitoring parameters for owner

Follow-up Schedule:
   • Specific recheck appointments with timeframes
   • Conditions warranting earlier return
   • Communication expectations

Prognosis:
   • Expected outcome (excellent/good/guarded/poor)
   • Recovery timeline
   • Long-term management needs if chronic

Warning Signs (When to Return Immediately):
   • Emergency symptoms to watch for
   • Critical signs requiring immediate veterinary attention

Owner Discussion: (ONLY INCLUDE IF OWNER COMMUNICATION OCCURRED)
   Include if the clinician discussed any of the following with the owner:
   • Education provided about the condition or diagnosis
   • Prognosis discussion and owner understanding
   • Treatment options discussed and owner decisions
   • Informed consent acknowledgments
   • Financial discussions or constraints acknowledged
   • Owner's questions addressed
   
   IMPORTANT: This section captures what was COMMUNICATED to the owner during/after the exam, not what the owner reported initially (that goes in Subjective). If no owner discussion occurred during the visit, SKIP this entire section.`;

    // Build dynamic JSON structure based on enabled sections
    const soapSectionDescriptions: Record<string, string> = {
      subjective: '"subjective": "Patient history and client concerns as a plain text string..."',
      objective: '"objective": "Physical exam findings and diagnostics as a plain text string..."',
      assessment: '"assessment": "Structured clinical reasoning with bullet points: Primary Diagnosis, Differential Diagnoses, Clinical Reasoning, and Rule-outs..."',
      plan: '"plan": "Comprehensive treatment plan with subsections including Medications, Diagnostics, Home Care, Follow-up, Prognosis, Warning Signs, and Owner Discussion (when applicable)..."'
    };

    const enabledSoapDescriptions = sectionsToGenerate
      .filter(s => soapSectionDescriptions[s])
      .map(s => soapSectionDescriptions[s])
      .join(',\n  ');

    systemPrompt += `

Format your response as valid JSON with this exact structure (ONLY include the sections listed below):
{
  ${enabledSoapDescriptions}
}

IMPORTANT: Only generate the sections listed above. Do NOT include any other sections.

Example of CORRECT objective format:
"objective": "Vitals:\\n• Temperature: [[102.8°F]]\\n• Heart rate: [[220 bpm]]\\n• Respiratory rate: 24 breaths/min\\n• Weight: 4.5 kg\\n• Body condition score: 5/9\\n\\nPhysical Examination:\\n• General Appearance: Bright, alert, responsive\\n• Mucous membranes: Pink and moist\\n• CRT: < 2 seconds\\n• Cardiovascular: No murmur detected, regular rhythm\\n• Abdomen: [[Painful and tense on palpation]]\\n• Urinary bladder: [[Firm and moderately distended]]"

Example of CORRECT plan format (note: Diet & Activity sections skipped when no specific recommendations):
"plan": "Medications:\\n• Amoxicillin-Clavulanate 125mg PO BID x 14 days\\n• Meloxicam 0.5mg PO SID x 5 days (give with food)\\n• Omeprazole 5mg PO SID x 7 days\\n\\nDiagnostics Recommended:\\n• Recheck bloodwork (CBC, chemistry panel) in 2 weeks\\n• Abdominal ultrasound if symptoms persist beyond 5 days\\n\\nHome Care Instructions:\\n• Monitor for vomiting, diarrhea, or lethargy\\n• Record daily appetite and water intake\\n• Check gums daily for color changes\\n\\nFollow-up Schedule:\\n• Recheck appointment in 2 weeks for progress evaluation\\n• Call clinic if no improvement within 48-72 hours\\n\\nPrognosis:\\n• Good with appropriate treatment and compliance\\n• Expected improvement within 3-5 days\\n• Full recovery anticipated within 2 weeks\\n\\nWarning Signs (When to Return Immediately):\\n• Persistent vomiting (more than 2 episodes in 24 hours)\\n• Bloody diarrhea or vomit\\n• Collapse, extreme lethargy, or unresponsiveness\\n• Difficulty breathing\\n• Abdominal distension or severe pain"

Example of plan WITH Owner Discussion (include when owner communication occurred):
"plan": "Medications:\\n• Prednisone 5mg PO SID x 7 days, then taper\\n\\nDiagnostics Recommended:\\n• Lymph node aspirate for cytology\\n• CBC and chemistry panel\\n\\nHome Care Instructions:\\n• Monitor appetite and energy levels daily\\n• Ensure access to fresh water at all times\\n\\nFollow-up Schedule:\\n• Recheck in 1 week for response assessment\\n• Call immediately if breathing becomes labored\\n\\nPrognosis:\\n• Guarded pending diagnostic results\\n• Treatment options depend on cytology findings\\n\\nWarning Signs (When to Return Immediately):\\n• Difficulty breathing or rapid breathing\\n• Collapse or severe weakness\\n• Complete refusal to eat for more than 24 hours\\n\\nOwner Discussion:\\n• Owner was educated about the possibility of lymphoma or other neoplasia given the clinical signs\\n• Discussed prognosis and treatment options including chemotherapy referral\\n• Owner understands the risks and side effects associated with prednisone therapy\\n• Owner elected to proceed with palliative care at this time\\n• Contact information for oncology specialist provided"

Example of WRONG format (DO NOT DO THIS):
"objective": {"vitals": {"Temperature": "102.8°F"}, "physical_exam": {...}}

Be thorough and professional. Extract all relevant information from the conversation. Remember: plain text strings only, NO markdown, NO nested objects.

DATE/TIME EXCLUSION RULE:
• Do NOT include any dates or times in the SOAP notes output
• Skip date fields entirely - do not mention consultation date, visit date, or timestamps
• If follow-up timing is discussed, use relative terms like "in 2 weeks" rather than specific dates
• NEVER include absolute dates in any section

CRITICAL ANTI-HALLUCINATION RULE:
If the provided conversation/transcription is empty, too short, contains only greetings, or lacks any clinical information about a patient, you MUST respond with ONLY this JSON:
{"error": "INSUFFICIENT_CLINICAL_DATA", "message": "The provided input does not contain enough clinical information to generate accurate SOAP notes. Please provide patient history, examination findings, or clinical observations."}

DO NOT make up patient names, species, breeds, symptoms, diagnoses, or any clinical details. ONLY use information explicitly provided in the conversation. If no clinical data is present, return the error response above.`;

    // Add user chat notes as clinical context if any exist
    if (userChatNotes.length > 0) {
      systemPrompt += `\n\nCLINICAL DISCUSSION NOTES FROM CHAT:
The following notes were provided by the clinician during case discussion. Incorporate any constraints, preferences, or clinical decisions mentioned:

`;
      userChatNotes.forEach((note, index) => {
        systemPrompt += `${index + 1}. "${note}"\n`;
      });

      systemPrompt += `
When writing your SOAP notes:
- Look for any owner constraints, budget limitations, or equipment limitations mentioned
- Incorporate any treatment preferences or diagnostic decisions discussed
- Modify recommendations to accommodate any limitations mentioned
- Note any compromises being made due to constraints`;
    }

    // Add regeneration instruction if provided
    if (regenerationInstruction) {
      systemPrompt += `\n\nIMPORTANT - USER REGENERATION REQUEST:
The user wants you to regenerate the notes with these specific changes:
"${regenerationInstruction}"

Please apply these modifications while maintaining clinical accuracy and the required JSON format.`;
    }

    // Call Lovable AI Gateway to generate SOAP notes
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log('[LOVABLE-AI] Generating SOAP notes');
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
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
      console.error("[LOVABLE-AI] Gateway error:", error);
      if (response.status === 429) {
        throw new Error("Rate limits exceeded, please try again later.");
      }
      if (response.status === 402) {
        throw new Error("Payment required, please add funds to your Lovable AI workspace.");
      }
      if (response.status === 503) {
        throw new Error("AI service overloaded. Please try again shortly.");
      }
      throw new Error("Failed to generate SOAP notes");
    }

    const data = await response.json();
    const soapContent = data.choices?.[0]?.message?.content;

    // Parse the JSON response - handle various AI response formats
    let soap;
    try {
      // Strip markdown code blocks first (```json ... ```)
      let cleanedContent = soapContent;
      if (cleanedContent.includes("```")) {
        cleanedContent = cleanedContent
          .replace(/```json\s*/gi, "")
          .replace(/```\s*/g, "")
          .trim();
      }

      // Try to extract JSON from response (AI might add extra text)
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      let jsonStr = jsonMatch ? jsonMatch[0] : cleanedContent;

      // Remove trailing commas before closing braces/brackets (common AI mistake)
      jsonStr = jsonStr.replace(/,(\s*[}\]])/g, "$1");

      // Attempt to parse directly first
      try {
        soap = JSON.parse(jsonStr);
      } catch (firstError) {
        // If direct parse fails, try more aggressive sanitization
        console.log("Initial JSON parse failed, attempting sanitization...");
        
        // Extract each SOAP section individually using regex
        const subjectiveMatch = jsonStr.match(/"subjective"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
        const objectiveMatch = jsonStr.match(/"objective"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
        const assessmentMatch = jsonStr.match(/"assessment"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
        const planMatch = jsonStr.match(/"plan"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
        
        if (subjectiveMatch || objectiveMatch || assessmentMatch || planMatch) {
          // Reconstruct a clean JSON object
          soap = {
            subjective: subjectiveMatch ? subjectiveMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : "",
            objective: objectiveMatch ? objectiveMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : "",
            assessment: assessmentMatch ? assessmentMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : "",
            plan: planMatch ? planMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : ""
          };
          console.log("Successfully extracted SOAP sections via regex fallback");
        } else {
          // Last resort: try to fix common issues and parse again
          let sanitized = jsonStr
            // Replace unescaped control characters
            .replace(/[\x00-\x1f]/g, (char: string) => {
              if (char === '\n') return '\\n';
              if (char === '\r') return '\\r';
              if (char === '\t') return '\\t';
              return '';
            });
          
          soap = JSON.parse(sanitized);
        }
      }
    } catch (e) {
      console.error("Failed to parse SOAP JSON. Error:", (e as Error).message);
      console.error("Original content:", soapContent.substring(0, 500));
      throw new Error("Invalid SOAP format generated");
    }

    // Validate at least one section exists
    const hasAnySections = sectionsToGenerate.some(section => soap[section]);
    if (!hasAnySections) {
      console.error("SOAP response missing all required fields:", soap);
      throw new Error("Invalid SOAP format generated");
    }

    // Safety conversion: if any section is an object, convert to text
    for (const key of sectionsToGenerate) {
      if (typeof soap[key] === "object" && soap[key] !== null) {
        soap[key] = formatObjectToText(soap[key]);
      }
    }
    
    // Filter response to only include enabled sections
    const filteredSoap: Record<string, string> = {};
    sectionsToGenerate.forEach(section => {
      filteredSoap[section] = soap[section] || '';
    });

    console.log("Generated SOAP notes:", JSON.stringify(filteredSoap, null, 2));

    return new Response(JSON.stringify({ soap: filteredSoap }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in generate-soap function:", error);
    return new Response(JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
