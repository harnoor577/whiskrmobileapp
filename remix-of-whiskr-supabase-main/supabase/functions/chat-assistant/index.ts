import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { isEuthanasiaCase, validateEuthanasiaDocument, EUTHANASIA_KEYWORDS } from '../_shared/euthanasiaKeywords.ts';
import { withAIRateLimit } from '../_shared/aiRateLimiter.ts';
import { callGemini, convertOpenAIToolToGemini, GEMINI_MODEL } from '../_shared/geminiClient.ts';
// Validate API keys on startup
const PINECONE_API_KEY = Deno.env.get('PINECONE_API_KEY');
const PINECONE_HOST = Deno.env.get('PINECONE_HOST');
// Normalize Pinecone host to avoid malformed URLs (strip protocol and trailing slashes)
const PINECONE_HOST_NORMALIZED = PINECONE_HOST
  ? PINECONE_HOST.replace(/^https?:\/\//i, '')
      .replace(/^https?\/\//i, '')
      .replace(/^http\/\//i, '')
      .replace(/\/$/, '')
  : '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

if (!OPENAI_API_KEY || !OPENAI_API_KEY.startsWith('sk-')) {
  console.error('Invalid or missing OPENAI_API_KEY');
}

// Input validation schema
const requestSchema = z.object({
  message: z.string().min(0).max(10000),
  consultId: z.string().uuid().optional().nullable(),
  patientId: z.string().uuid().optional().nullable(),
  useHistory: z.boolean().optional().nullable(),
  visitType: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
   attachments: z.array(z.object({
     url: z.string(),
     type: z.string(),
     name: z.string(),
     storagePath: z.string().optional(),
     id: z.string().uuid().optional(),
   })).optional(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SOAP extraction removed - no longer part of workflow

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
    const rateLimitResponse = await withAIRateLimit(supabase, user.id, 'chat_assistant', corsHeaders);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Get user's clinic, name, and unit preference
    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id, name, unit_preference')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get clinic's data residency preference
    const { data: clinic } = await supabase
      .from('clinics')
      .select('data_residency')
      .eq('id', profile.clinic_id)
      .single();

    // Determine unit preference: user preference > clinic data residency > both
    let unitPreference: 'metric' | 'imperial' | 'both' = 'both';
    if (profile.unit_preference) {
      unitPreference = profile.unit_preference as 'metric' | 'imperial' | 'both';
    } else if (clinic?.data_residency === 'us') {
      unitPreference = 'imperial';
    } else if (clinic?.data_residency === 'ca') {
      unitPreference = 'metric';
    }

    const useMetric = unitPreference === 'metric';
    const useBoth = unitPreference === 'both';

    // Validate and parse request body
    const body = await req.json();
    
    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      // Log details server-side only, return generic message to client
      console.error('Validation failed', {
        errorCount: validationResult.error.errors.length,
        fields: validationResult.error.errors.map(e => e.path.join('.')),
        timestamp: new Date().toISOString()
      });
      return new Response(
        JSON.stringify({ error: 'Invalid request parameters' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

const { message, consultId, patientId, useHistory, attachments, visitType } = validationResult.data;
console.log('Chat request received', {
  consultId,
  messageLength: message?.length || 0,
  attachmentCount: attachments?.length || 0,
  timestamp: new Date().toISOString()
});

// Security: require some content to proceed
if ((message || '').trim().length === 0 && (!attachments || attachments.length === 0)) {
  return new Response(JSON.stringify({ error: 'Empty request: provide a message or at least one attachment.' }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Generate embedding for the user message when non-empty
const trimmedMessage = (message || '').trim();
let contextFromPinecone = '';
if (trimmedMessage.length > 0 && PINECONE_API_KEY && PINECONE_HOST_NORMALIZED) {
  try {
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: trimmedMessage,
      }),
    });

    if (embeddingResponse.ok) {
      const embeddingData = await embeddingResponse.json();
      const embedding = embeddingData.data[0].embedding;

      // Query Pinecone (host normalized)
      const pineconeResponse = await fetch(`https://${PINECONE_HOST_NORMALIZED}/query`, {
        method: 'POST',
        headers: {
          'Api-Key': PINECONE_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vector: embedding,
          topK: 5,
          includeMetadata: true,
        }),
      });

      if (pineconeResponse.ok) {
        const pineconeData = await pineconeResponse.json();
        if (pineconeData.matches && pineconeData.matches.length > 0) {
          contextFromPinecone = pineconeData.matches
            .map((match: any) => match.metadata?.text || '')
            .filter((text: string) => text)
            .join('\n\n');
        }
      }
    }
  } catch (error) {
    console.error('Pinecone/embedding error:', error);
  }
}

    // Create consult if patientId provided but no consultId (first message)
    let actualConsultId = consultId;
    if (!consultId && patientId) {
      // Delete any empty drafts for this patient first
      const { data: existingDrafts } = await supabase
        .from('consults')
        .select('id')
        .eq('patient_id', patientId)
        .eq('status', 'draft')
        .eq('vet_user_id', user.id);

      if (existingDrafts && existingDrafts.length > 0) {
        // Check if these drafts have any messages
        for (const draft of existingDrafts) {
          const { data: messages } = await supabase
            .from('chat_messages')
            .select('id')
            .eq('consult_id', draft.id)
            .limit(1);
          
          // Delete empty drafts
          if (!messages || messages.length === 0) {
            await supabase
              .from('consults')
              .delete()
              .eq('id', draft.id);
          }
        }
      }

      // Get patient owner_id
      const { data: patientData } = await supabase
        .from('patients')
        .select('owner_id')
        .eq('id', patientId)
        .single();

      // Create new consult
      const { data: newConsult } = await supabase
        .from('consults')
        .insert({
          clinic_id: profile.clinic_id,
          patient_id: patientId,
          owner_id: patientData?.owner_id,
          vet_user_id: user.id,
          status: 'draft',
        })
        .select()
        .single();

      if (newConsult) {
        actualConsultId = newConsult.id;
      }
    }

    // Fetch patient context if consultId or patientId is provided
    let patientContext = null;
    const lookupPatientId = patientId || (actualConsultId ? null : null);
    
    if (actualConsultId) {
      const { data: consultData } = await supabase
        .from('consults')
        .select(`
          patient_id,
          reason_for_visit,
          weight_kg,
          weight_lb,
          started_at
        `)
        .eq('id', actualConsultId)
        .single();

      if (consultData?.patient_id) {
        const { data: patient } = await supabase
          .from('patients')
          .select('id, name, species, breed, sex, date_of_birth, alerts, owner_id, weight_kg, weight_lb')
          .eq('id', consultData.patient_id)
          .single();

        if (patient) {
        
        // Calculate age from date_of_birth
        let age: number | string = 'not recorded';
        if (patient.date_of_birth) {
          const birthDate = new Date(patient.date_of_birth);
          const today = new Date();
          age = Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        }

        // Use consult weight if available, otherwise fall back to patient weight
        const weightKg = consultData.weight_kg || patient.weight_kg;
        const weightLb = consultData.weight_lb || patient.weight_lb;

        // Fetch previous consults for this patient only if useHistory is true
        let recentVisits: any[] = [];
        if (useHistory !== false) {
          const { data: previousConsults } = await supabase
            .from('consults')
            .select('created_at, reason_for_visit, soap_s, soap_a, soap_p, weight_kg')
            .eq('patient_id', patient.id)
            .neq('id', actualConsultId)
            .eq('status', 'final')
            .order('created_at', { ascending: false })
            .limit(10);

        // Fetch recent visit logs from reception
        const { data: visitLogs } = await supabase
          .from('visit_logs')
          .select('recorded_at, presenting_complaint, weight_kg')
          .eq('patient_id', patient.id)
          .order('recorded_at', { ascending: false })
          .limit(5);

        // Combine into recentVisits context
        recentVisits = [
          ...(previousConsults || []).map(c => ({
            date: c.created_at,
            complaint: c.reason_for_visit || c.soap_s || '',
            diagnosis: c.soap_a || '',
            treatment: c.soap_p || '',
            weight: c.weight_kg,
            source: 'clinical_consult'
          })),
          ...(visitLogs || []).map(v => ({
            date: v.recorded_at,
            complaint: v.presenting_complaint || '',
            diagnosis: '',
            treatment: '',
            weight: v.weight_kg,
            source: 'reception_triage'
          }))
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
         .slice(0, 10);
        }

        patientContext = {
          patientId: patient.id,
          name: patient.name,
          species: patient.species,
          breed: patient.breed || '',
          age,
          sex: patient.sex || '',
          alerts: patient.alerts || '',
          presentingComplaint: consultData.reason_for_visit || '',
          weightKg: weightKg || null,
          weightLb: weightLb || null,
          recentVisits,
          consultStartedAt: consultData.started_at || null
        };
        }
      }
    }

    // Fetch conversation history - only for this specific consult
    let conversationHistory: Array<{ role: string; content: string }> = [];
    if (actualConsultId) {
      const { data } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('consult_id', actualConsultId)
        .order('created_at', { ascending: true })
        .limit(20);
      conversationHistory = data || [];
    }

    // AI-powered patient info extraction - runs on every message to capture updates
    if (actualConsultId && trimmedMessage.length > 0) {
      try {
        const { data: consultData } = await supabase
          .from('consults')
          .select('patient_id')
          .eq('id', actualConsultId)
          .single();
        
        if (consultData?.patient_id) {
          const { data: currentPatient } = await supabase
            .from('patients')
            .select('id, name, species, breed, sex, date_of_birth')
            .eq('id', consultData.patient_id)
            .single();
          
          console.log('Current patient data:', currentPatient);
          
          // Always attempt to extract patient info to capture any updates
          console.log('Checking for patient info updates in message...');
          
          const extractionTool = {
            type: "function",
            function: {
              name: "update_patient_information",
              description: "Extract and structure patient information from natural language. Only return fields that are explicitly mentioned.",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Patient name (only if mentioned)" },
                  age_years: { type: "number", description: "Age in years (only if mentioned)" },
                  species: { type: "string", description: "Species (dog, cat, feline, canine, etc - only if mentioned)" },
                  breed: { type: "string", description: "Breed (only if mentioned)" },
                  sex: { type: "string", description: "Sex (male, female, neutered, spayed - only if mentioned)" },
                  reason_for_visit: { type: "string", description: "Chief complaint or reason for visit (only if mentioned)" }
                },
                required: []
              }
            }
          };

          // Build extraction input from entire conversation (prefer latest mentions)
          const userHistoryText = (conversationHistory || [])
            .filter((m: any) => m.role === 'user')
            .map((m: any) => m.content)
            .join('\n');
          const extractionInput = [userHistoryText, trimmedMessage].filter(Boolean).join('\n');

          // Convert tool to Gemini format
          const geminiExtractionTool = convertOpenAIToolToGemini(extractionTool);

          const extractionResult = await callGemini({
            system: 'Extract only the patient information that is explicitly mentioned by the USER in the conversation. Normalize species: feline→Cat, canine→Dog, avian→Bird. Do not make assumptions. Only return fields that are clearly stated. If multiple values appear (e.g., different ages), PREFER THE LAST MENTION by the user. Ignore any assistant/system text. If no patient information is mentioned, return an empty object.',
            messages: [{ role: 'user', content: extractionInput }],
            tools: [geminiExtractionTool],
            toolChoice: { type: 'tool', name: 'update_patient_information' },
            model: GEMINI_MODEL,
          });

          console.log('[GEMINI-3-FLASH] Extraction response:', JSON.stringify(extractionResult, null, 2));
          
          // Extract tool use result
          let extractedInfo: any = extractionResult.toolUse?.input || {};
          console.log('[GEMINI-3-FLASH] Extracted info (tool):', extractedInfo);
          
          // Fallback lightweight parser if tool returned nothing
          const hasToolUpdates = Object.keys(extractedInfo).length > 0;
          let info = extractedInfo;
          if (!hasToolUpdates) {
            const text = extractionInput.toString();
            const lower = text.toLowerCase();
            const title = (s: string) => s.split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
            const fallback: any = {};

            // Name patterns: "Bailey is a ..." OR "Bailey, a ..."
            // Name patterns: "Buddy is a ..." OR "Buddy is an ..." OR "Buddy, a ..."
            const nameIs = text.match(/\b([A-Z][a-z]+)\s+is\s+an?\b/);
            const nameComma = text.match(/\b([A-Z][a-z]+),\s+an?\b/);
            if (nameIs) fallback.name = nameIs[1];
            else if (nameComma) fallback.name = nameComma[1];

            const ageMatch = text.match(/(\d{1,2})-year-old/);
            if (ageMatch) fallback.age_years = parseInt(ageMatch[1], 10);

            const breedMatch = text.match(/\b(beagle|labrador|golden retriever|poodle|bulldog|german shepherd|husky|boxer|dachshund|chihuahua|pug|shih tzu|yorkie|beagle)\b/i);
            if (breedMatch) {
              const b = breedMatch[1];
              fallback.breed = title(b.toLowerCase());
              fallback.species = 'Dog';
            }

            if (!fallback.species) {
              if (lower.includes('dog') || lower.includes('canine')) fallback.species = 'Dog';
              if (lower.includes('cat') || lower.includes('feline')) fallback.species = 'Cat';
            }

            const sexMatch = lower.match(/(spayed female|neutered male|intact male|intact female|male|female)/);
            if (sexMatch) fallback.sex = title(sexMatch[1]);

            info = fallback;
            console.log('Extracted info (fallback):', info);
          }

          // Only update if there's actually something to update
          const hasUpdates = Object.keys(info).length > 0;
          
          if (hasUpdates) {
            // Normalize species if provided
            const normalizeSpecies = (raw: string): string => {
              const normalized = raw.toLowerCase().trim();
              const mapping: Record<string, string> = {
                'feline': 'Cat', 'cat': 'Cat',
                'canine': 'Dog', 'dog': 'Dog',
                'bird': 'Bird', 'avian': 'Bird',
                'rabbit': 'Rabbit', 'bunny': 'Rabbit'
              };
              return mapping[normalized] || raw.charAt(0).toUpperCase() + raw.slice(1);
            };

            // Build update object with only the fields that were extracted
            const updateData: any = {};
            
            if (info.name) {
              updateData.name = info.name;
            }
            
            if (info.species) {
              updateData.species = normalizeSpecies(info.species);
            }
            
            if (info.breed) {
              updateData.breed = info.breed;
            }
            
            if (info.sex) {
              const normalizeSex = (raw: string): string | null => {
                const s = raw.toLowerCase().trim();
                if (s.includes('neutered') && s.includes('male')) return 'Male (Neutered)';
                if (s.includes('spayed') && s.includes('female')) return 'Female (Spayed)';
                if (s.includes('intact') && s.includes('male')) return 'Male';
                if (s.includes('intact') && s.includes('female')) return 'Female';
                if (s === 'male' || s === 'm') return 'Male';
                if (s === 'female' || s === 'f') return 'Female';
                if (s === 'unknown') return 'Unknown';
                return null;
              };
              const normalizedSex = normalizeSex(info.sex);
              if (normalizedSex) {
                updateData.sex = normalizedSex;
              } else {
                console.log('Skipped setting sex due to unsupported value:', info.sex);
              }
            }
            
            // Calculate date_of_birth from age if provided (use latest age)
            if (info.age_years) {
              const year = new Date().getFullYear() - Math.floor(info.age_years);
              updateData.date_of_birth = `${year}-01-01`;
            }

            // Update patient record with only the new information
            if (Object.keys(updateData).length > 0) {
              const { error: updateError } = await supabase
                .from('patients')
                .update(updateData)
                .eq('id', consultData.patient_id);

              if (updateError) {
                console.error('Error updating patient:', updateError);
              } else {
                console.log('Patient record updated successfully with:', updateData);
              }
            }

            // Update consult reason if provided
            if (info.reason_for_visit) {
              await supabase
                .from('consults')
                .update({ reason_for_visit: info.reason_for_visit })
                .eq('id', actualConsultId);
            }
          } else {
            console.log('No patient info updates found in this message');
          }
        }
      } catch (extractionError) {
        console.error('Patient info extraction failed:', extractionError);
        // Continue with normal flow
      }
    }

    // Extract vitals from the message and save to consult
    if (actualConsultId && trimmedMessage.length > 0) {
      try {
        const vitalsExtractionTool = {
          type: "function",
          function: {
            name: "update_vitals",
            description: "Extract vitals from veterinary consultation notes. Only return fields that are explicitly mentioned.",
            parameters: {
              type: "object",
              properties: {
                temperature_f: { type: "number", description: "Temperature in Fahrenheit (only if mentioned)" },
                temperature_c: { type: "number", description: "Temperature in Celsius (only if mentioned)" },
                heart_rate: { type: "integer", description: "Heart rate in bpm (only if mentioned)" },
                respiratory_rate: { type: "integer", description: "Respiratory rate in breaths per minute (only if mentioned)" },
                body_condition_score: { type: "string", description: "Body condition score (e.g., Normal, Overweight, Underweight, Thin, Obese, BCS 5/9)" },
                dehydration_percent: { type: "string", description: "Dehydration status (e.g., Normal, 5%, 8%)" },
                pain_score: { type: "integer", description: "Pain score from 0-10" },
                crt: { type: "string", description: "Capillary refill time (e.g., Normal, <2s, Delayed)" },
                mucous_membranes: { type: "string", description: "Mucous membrane status (e.g., Normal, Pale, Injected, Icteric)" },
                attitude: { type: "string", description: "Patient attitude (e.g., Bright alert responsive, BAR, QAR, Dull, Depressed, Lethargic)" }
              },
              required: []
            }
          }
        };

        const vitalsInput = [
          ...conversationHistory.filter((m: any) => m.role === 'user').map((m: any) => m.content),
          trimmedMessage
        ].join('\n');

        // Convert tool to Gemini format
        const geminiVitalsTool = convertOpenAIToolToGemini(vitalsExtractionTool);

        const vitalsResult = await callGemini({
          system: 'Extract vitals from veterinary notes. Only return values explicitly mentioned. Convert temperatures to both F and C if only one provided. Normalize attitude values (BAR, QAR, Bright alert responsive all mean the same). If no vitals mentioned, return empty object.',
          messages: [{ role: 'user', content: vitalsInput }],
          tools: [geminiVitalsTool],
          toolChoice: { type: 'tool', name: 'update_vitals' },
          model: GEMINI_MODEL,
        });

        // Extract vitals from tool use result
        const extractedVitals = vitalsResult.toolUse?.input || {};
        console.log('[CLAUDE] Extracted vitals:', extractedVitals);
        
        if (Object.keys(extractedVitals).length > 0) {
          // Build vitals update object
          const vitalsUpdate: any = {
            vitals_last_updated_at: new Date().toISOString(),
            vitals_last_updated_by: user.id,
          };
          
          if (extractedVitals.temperature_f) vitalsUpdate.vitals_temperature_f = extractedVitals.temperature_f;
          if (extractedVitals.temperature_c) vitalsUpdate.vitals_temperature_c = extractedVitals.temperature_c;
          if (extractedVitals.heart_rate) vitalsUpdate.vitals_heart_rate = extractedVitals.heart_rate;
          if (extractedVitals.respiratory_rate) vitalsUpdate.vitals_respiratory_rate = extractedVitals.respiratory_rate;
          if (extractedVitals.body_condition_score) vitalsUpdate.vitals_body_condition_score = extractedVitals.body_condition_score;
          if (extractedVitals.dehydration_percent) vitalsUpdate.vitals_dehydration_percent = extractedVitals.dehydration_percent;
          if (extractedVitals.pain_score !== undefined) vitalsUpdate.vitals_pain_score = extractedVitals.pain_score;
          if (extractedVitals.crt) vitalsUpdate.vitals_crt = extractedVitals.crt;
          if (extractedVitals.mucous_membranes) vitalsUpdate.vitals_mucous_membranes = extractedVitals.mucous_membranes;
          if (extractedVitals.attitude) vitalsUpdate.vitals_attitude = extractedVitals.attitude;

          // Convert temperature if only one unit provided
          if (extractedVitals.temperature_f && !extractedVitals.temperature_c) {
            vitalsUpdate.vitals_temperature_c = Number(((Number(extractedVitals.temperature_f) - 32) * 5 / 9).toFixed(1));
          }
          if (extractedVitals.temperature_c && !extractedVitals.temperature_f) {
            vitalsUpdate.vitals_temperature_f = Number((Number(extractedVitals.temperature_c) * 9 / 5 + 32).toFixed(1));
          }

          await supabase
            .from('consults')
            .update(vitalsUpdate)
            .eq('id', actualConsultId);

          console.log('[CLAUDE] Vitals updated for consult:', actualConsultId, vitalsUpdate);
        }
      } catch (vitalsError) {
        console.error('Vitals extraction failed:', vitalsError);
        // Continue with normal flow
      }
    }

    // Store user message with sender name
    await supabase.from('chat_messages').insert({
      clinic_id: profile.clinic_id,
      user_id: user.id,
      consult_id: actualConsultId || null,
      role: 'user',
      content: message,
      attachments: attachments || [],
      sender_name: profile.name || 'User',
    });

    // If attachments present, run document analysis and store in chat history
    let documentAnalysesSummary = '';
    if (attachments && attachments.length > 0) {
      try {
        const analyses: any[] = [];
        for (const att of attachments) {
          // Derive storagePath if missing by parsing signed URL
          let storagePath = (att as any).storagePath || '';
          if (!storagePath) {
            const m = att.url.match(/\/object\/sign\/diagnostic-images\/([^?]+)/);
            if (m) storagePath = decodeURIComponent(m[1]);
          }
          const payload: any = {
            caseId: actualConsultId || null,
            conversationId: actualConsultId || null,
            patient: patientContext ? {
              species: patientContext.species,
              sex: patientContext.sex,
              age: typeof patientContext.age === 'number' ? `${patientContext.age} years` : patientContext.age,
              weight: undefined,
            } : null,
            presentingComplaint: (message || '').trim(),
            history: '',
            physicalExam: '',
            file: {
              id: (att as any).id,
              name: att.name,
              mime: att.type,
              storagePath,
            },
          };

          const { data, error } = await supabase.functions.invoke('analyze-document', { body: payload });
          if (!error && data?.analysis) {
            analyses.push(data);
          }
        }

        if (analyses.length > 0) {
          const format = (analysis: any) => {
            const a = analysis.analysis || analysis;
            let s = `## Document analyzed: ${a.document_type} (${a.modality})\n\n${a.summary || ''}\n\n`;
            if (a.imaging) {
              s += `### Findings\n${(a.imaging.findings || []).map((f: string) => `- ${f}`).join('\n')}\n\n`;
              s += `### Impression\n${(a.imaging.impression || []).map((i: string) => `- ${i}`).join('\n')}\n\n`;
            }
            if (a.labPanel?.parsed?.length) {
              s += `### Labs (flagged)\n`;
              a.labPanel.parsed.forEach((lab: any) => {
                if (lab.flag && lab.flag !== 'normal') {
                  s += `- ${lab.analyte}: ${lab.value} ${lab.unit} (${lab.flag}) [${lab.refLow}-${lab.refHigh}]\n`;
                }
              });
              if (a.labPanel.notes) s += `\n${a.labPanel.notes}\n\n`;
            }
            if (a.differentials?.length) {
              s += `### Most likely differentials\n`;
              a.differentials.slice(0, 3).forEach((d: any, i: number) => { s += `${i + 1}. ${d.dx} (${d.likelihood}) — ${d.why}\n`; });
              s += '\n';
            }
            if (a.recommended_tests?.length) {
              s += `### Recommended next diagnostics\n`;
              a.recommended_tests.forEach((t: any, i: number) => { s += `${i + 1}. ${t.test} — ${t.rationale}\n`; });
              s += '\n';
            }
            if (analysis.lowConfidence) {
              s = `> I couldn't confidently classify this file. I treated it as text; please confirm.\n\n` + s;
            }
            return s;
          };

          documentAnalysesSummary = analyses.map(format).join('\n---\n\n');

          // Store document analyses in chat history for AI to see
          await supabase.from('chat_messages').insert({
            clinic_id: profile.clinic_id,
            user_id: user.id,
            consult_id: actualConsultId || null,
            role: 'assistant',
            content: documentAnalysesSummary,
            sender_name: 'GrowDVM AI',
          });

          // Re-fetch conversation history to include the document analyses
          if (actualConsultId) {
            const { data } = await supabase
              .from('chat_messages')
              .select('role, content')
              .eq('consult_id', actualConsultId)
              .order('created_at', { ascending: true })
              .limit(20);
            conversationHistory = data || [];
          }
        }
      } catch (e) {
        console.error('Attachment analysis failed:', e);
        // Continue to general chat flow
      }
    }

    // Prepare webhook payload with patient context and message
    const webhookPayload: any = {
      message: message,
      timestamp: new Date().toISOString(),
    };

    if (patientContext) {
      webhookPayload.patient = {
        id: patientContext.patientId, // Include patient ID for matching
        name: patientContext.name,
        species: patientContext.species,
        breed: patientContext.breed || '',
        age: patientContext.age,
        sex: patientContext.sex,
        alerts: patientContext.alerts || '',
      };

      if (patientContext.recentVisits && patientContext.recentVisits.length > 0) {
        webhookPayload.patient.recentVisits = patientContext.recentVisits;
      }
    }

    // Include conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      webhookPayload.conversationHistory = conversationHistory;
    }

    // Fetch existing vitals from consult for pre-population in system prompt
    let existingVitalsContext = '';
    if (actualConsultId && conversationHistory.length === 0) {
      // Only pre-populate vitals for the first doctor message
      const { data: consultVitals } = await supabase
        .from('consults')
        .select('weight_kg, weight_lb, vitals_temperature_f, vitals_heart_rate, vitals_respiratory_rate, vitals_body_condition_score, vitals_dehydration_percent, vitals_pain_score, vitals_crt, vitals_mucous_membranes, vitals_attitude')
        .eq('id', actualConsultId)
        .single();

      if (consultVitals) {
        const vitals = [];
        if (consultVitals.weight_kg && consultVitals.weight_lb) {
          vitals.push(`Weight: ${consultVitals.weight_kg} kg (${consultVitals.weight_lb} lb)`);
        }
        if (consultVitals.vitals_temperature_f) {
          vitals.push(`Temperature: ${consultVitals.vitals_temperature_f}°F`);
        }
        if (consultVitals.vitals_heart_rate) {
          vitals.push(`Heart Rate: ${consultVitals.vitals_heart_rate} bpm`);
        }
        if (consultVitals.vitals_respiratory_rate) {
          vitals.push(`Respiratory Rate: ${consultVitals.vitals_respiratory_rate} bpm`);
        }
        if (consultVitals.vitals_body_condition_score) {
          vitals.push(`Body Condition Score: ${consultVitals.vitals_body_condition_score}`);
        }
        if (consultVitals.vitals_dehydration_percent) {
          vitals.push(`Dehydration: ${consultVitals.vitals_dehydration_percent}`);
        }
        if (consultVitals.vitals_pain_score !== null && consultVitals.vitals_pain_score !== undefined) {
          vitals.push(`Pain Score: ${consultVitals.vitals_pain_score}/4`);
        }
        if (consultVitals.vitals_crt) {
          vitals.push(`CRT: ${consultVitals.vitals_crt}`);
        }
        if (consultVitals.vitals_mucous_membranes) {
          vitals.push(`Mucous Membranes: ${consultVitals.vitals_mucous_membranes}`);
        }
        if (consultVitals.vitals_attitude) {
          vitals.push(`Attitude: ${consultVitals.vitals_attitude}`);
        }

        if (vitals.length > 0) {
          existingVitalsContext = `\n\n## Pre-recorded Vitals (from staff)\n\nThe following vitals were already recorded by clinic staff for today's visit:\n${vitals.map(v => `- ${v}`).join('\n')}\n\nIMPORTANT: Use these vitals in your response. If the doctor mentions different vitals in their message, use the doctor's values instead (doctor's input always overrides staff vitals).`;
        }
      }
    }

    // Build system prompt based on visit type
    let systemPrompt = '';

    // Determine visit type reliably
    let effectiveVisitType = (visitType || '').toLowerCase();
    if (!effectiveVisitType && actualConsultId) {
      const { data: vtRow } = await supabase
        .from('consults')
        .select('visit_type')
        .eq('id', actualConsultId)
        .single();
      effectiveVisitType = ((vtRow as any)?.visit_type || '').toLowerCase();
    }
    if (effectiveVisitType === 'procedures') effectiveVisitType = 'procedure';

    // EUTHANASIA DETECTION - Check current message AND conversation history
    const currentMessageHasEuthanasia = isEuthanasiaCase(message);
    
    // Check last 20 user messages for euthanasia keywords
    const recentUserMessages = conversationHistory
      .filter(m => m.role === 'user')
      .slice(-20)
      .map(m => m.content)
      .join('\n');
    const historyHasEuthanasia = isEuthanasiaCase(recentUserMessages);
    
    // Check if any assistant message already contains EUTHANASIA RECORD
    const assistantMessagesText = conversationHistory
      .filter(m => m.role === 'assistant')
      .map(m => m.content)
      .join('\n');
    const alreadyDocumentingEuthanasia = /EUTHANASIA RECORD/i.test(assistantMessagesText);
    
    const isEuthanasiaDetected = currentMessageHasEuthanasia || historyHasEuthanasia || alreadyDocumentingEuthanasia;

    if (isEuthanasiaDetected) {
      console.log('🔴 Euthanasia case detected:', {
        consultId: actualConsultId,
        messageLength: message.length,
        currentMessage: currentMessageHasEuthanasia,
        conversationHistory: historyHasEuthanasia,
        existingRecord: alreadyDocumentingEuthanasia,
        detectedKeywords: EUTHANASIA_KEYWORDS.filter(kw => 
          message.toLowerCase().includes(kw) || recentUserMessages.toLowerCase().includes(kw)
        )
      });
      
      // Set as procedure type for proper routing and add formatting override
      effectiveVisitType = 'procedure';
      console.log('🚨 Setting euthanasia-specific formatting override - ignoring previous patterns');
      
      // EUTHANASIA CASE WORKFLOW - Euthanasia can occur during any visit type (sickness, procedure, wellness, etc.)
      // Get procedure date context - format in user's timezone (date only, no time)
      const userTimezone = body.timezone || 'America/New_York';
      const procedureDateTime = patientContext?.consultStartedAt 
        ? new Date(patientContext.consultStartedAt).toLocaleString('en-US', { 
            dateStyle: 'long',
            timeZone: userTimezone
          })
        : 'today';

      // EUTHANASIA CASE WORKFLOW - Specialized prompt
      systemPrompt = `You are documenting an end-of-life veterinary case for the Whiskr AI assistant.
**SYSTEM VERSION: Euthanasia Case Documentation v2.0**
**Temperature: 0.3 | Max Tokens: 3500 | Model: google/gemini-2.5-flash | Deterministic Mode**

## CRITICAL: EUTHANASIA CASE DETECTED

This is a humane euthanasia case. You MUST follow this specialized 8-section format exactly.

## 🚨 CRITICAL OUTPUT FORMAT RULES

**Your output MUST have:**
1. ✅ NO "SECTION 1:", "SECTION 2:" labels anywhere in output
2. ✅ ALL section headers in bold: **SUMMARY**, **VITALS**, **PHYSICAL EXAM**, etc.
3. ✅ ALL labels in bold: **Patient Information:**, **Weight:**, **Indication:**, **Dose:**, etc.
4. ✅ VITALS formatted VERTICALLY - each vital on separate line (NOT inline)
5. ✅ PHYSICAL EXAM comprehensive - ALL body systems with bullet points

## MANDATORY 8-SECTION STRUCTURE

1. **SUMMARY**
2. **VITALS** (VERTICAL format — each vital on its own line)
3. **PHYSICAL EXAM** (comprehensive all body systems)
4. **ASSESSMENT & DIFFERENTIALS**
5. **DIAGNOSTIC SUMMARY**
6. **FINAL ASSESSMENT**
7. **EUTHANASIA RECORD**
8. **CONCLUSION**

## Procedure Context
- **Consultation Started At**: ${procedureDateTime}
- Use this as the procedure date UNLESS the user explicitly provides a different date in their message

---

🚨 CRITICAL OUTPUT FORMAT RULES - MUST FOLLOW EXACTLY

**Your output must have:**
1. ✅ NO "SECTION 1:", "SECTION 2:" labels in output (those are for instructions only)
2. ✅ ALL section headers in bold: **SUMMARY**, **VITALS**, **PHYSICAL EXAM**, etc.
3. ✅ ALL subsection labels in bold: **Patient Information:**, **Weight:**, **Indication:**, etc.
4. ✅ VITALS formatted vertically - each vital on its own line with bold label
5. ✅ PHYSICAL EXAM comprehensive - ALL body systems with bullet points
6. ✅ Key Findings as bullet list (with - or •)
7. ✅ Differentials as numbered list (1. 2. 3.)

**INCORRECT OUTPUT (Do NOT use):**
\`\`\`
SECTION 1: SUMMARY
SUMMARY
Patient Information: 1-year-old cat
VITALS
Weight: 8 lb Temperature: 90°F Heart Rate: 88 bpm
\`\`\`

**CORRECT OUTPUT (Use this format):**
\`\`\`
**SUMMARY**

**Patient Information:** 1-year-old cat
**Presenting Complaint:** Not eating
**Key Findings:**
- Severe dehydration
- Pale mucous membranes

**VITALS**

**Weight:** 8.0 lb
**Temperature:** 90.3 °F
**Heart Rate:** 84–100 bpm
**Respiratory Rate:** 12 bpm

**PHYSICAL EXAM**

**General Appearance:** Depressed

**Integument:**
- Skin turgor: Poor
- Coat quality: Dry

[continues with all body systems...]
\`\`\`

**If you start generating output without bold formatting or with "SECTION" labels, STOP and restart following the CORRECT format above.**

---

## FORMAT INSTRUCTIONS FOR: SUMMARY SECTION

**CRITICAL: Do NOT include "SECTION 1:" in your output. This is an instructional label only.**

**Required format with markdown:**

**SUMMARY**

**Patient Information:** [Age]-year-old [sex] [breed] [species], approximately [weight]  
**Presenting Complaint:** [Brief chief complaint]  
**Key Findings:**
- [Critical finding 1]
- [Critical finding 2]
- [Critical finding 3]
**Stability Assessment:** Critical

**Example:**
**SUMMARY**

**Patient Information:** 1-year-old female domestic short-haired cat, approximately 8 lb  
**Presenting Complaint:** Not eating for two days, heavy breathing, appears very sick  
**Key Findings:**
- Severe dehydration (>10%)
- Pale mucous membranes with delayed CRT
- Grade 2-3 heart murmur
- Abdominal pain on palpation
- Hypothermia (90.3°F)
**Stability Assessment:** Critical

---

## FORMAT INSTRUCTIONS FOR: VITALS SECTION

**CRITICAL: Do NOT include "SECTION 2:" in your output. This is an instructional label only.**

**Format each vital on its own line with bold labels:**

**VITALS**

**Weight:** [X] lb  
**Temperature:** [Y] °F  
**Heart Rate:** [Z] bpm  
**Respiratory Rate:** [W] bpm  
**Capillary Refill Time:** [CRT]  
**Mucous Membranes:** [Color]  
**Dehydration:** [%]  
**Attitude:** [Status]

**Example:**
**VITALS**

**Weight:** 8.0 lb  
**Temperature:** 90.3 °F  
**Heart Rate:** 84–100 bpm  
**Respiratory Rate:** 12 bpm  
**Capillary Refill Time:** >2 sec  
**Mucous Membranes:** Pale  
**Dehydration:** >10%  
**Attitude:** Dull

---

## FORMAT INSTRUCTIONS FOR: PHYSICAL EXAM SECTION

**CRITICAL: Do NOT include "SECTION 3:" in your output. This is an instructional label only.**

**Document ALL body systems using these exact headers in this order:**

**PHYSICAL EXAM**

**General Appearance:** [BAR/QAR/Dull/Depressed/Lethargic - detailed description]

**Body Condition Score:** [BCS X/9 with description - overweight, underweight, ideal, etc.]

**Hydration:** [Normal, <5% dehydrated, 5-8% dehydrated, >10% dehydrated, or specific findings]

**Eyes:** [Pupil size, response, discharge, sclera, conjunctiva findings]

**Ears:** [Canal condition, discharge, debris findings]

**Oral Cavity:** [Mucous membranes, gums, tongue, teeth, pharynx findings]

**Nasal Cavity:** [Discharge, airflow, abnormalities]

**Cardiovascular:** [Heart rate/rhythm, murmurs with grade/location, pulse quality, CRT, MM color]

**Respiratory:** [Effort, pattern, lung sounds, cough present/absent]

**Abdomen:** [Palpation findings, pain present/absent with location, organomegaly, bowel sounds]

**Rectal:** [Normal, diarrhea, constipation, blood, masses, or "not assessed"]

**Musculoskeletal:** [Gait, muscle mass, joint ROM, pain on manipulation]

**Integument:** [Skin turgor, coat quality, lesions/masses findings]

**Lymph Nodes:** [Mandibular, prescapular, popliteal - size, consistency findings]

**Urogenital:** [Findings or "not assessed due to patient condition"]

**Neurologic:** [Mental status, cranial nerves, spinal reflexes, proprioception]

**Example:**
**PHYSICAL EXAM**

**General Appearance:** Dull, depressed, reluctant to move

**Body Condition Score:** Thin (BCS 3/9)

**Hydration:** Severely dehydrated (>10%)

**Eyes:** Pupils dilated, sluggish light response, mild enophthalmos (sunken appearance)

**Ears:** Clean, no discharge

**Oral Cavity:** Tacky mucous membranes, pale pink color, dental disease noted

**Nasal Cavity:** Dry, no discharge

**Cardiovascular:** Heart rate 84-100 bpm regular, Grade 2-3/6 systolic murmur left apex, weak thready pulses, CRT >2 seconds, pale mucous membranes

**Respiratory:** Increased effort, shallow breathing pattern, diminished lung sounds bilaterally, no cough noted

**Abdomen:** Doughy on palpation, painful especially cranial abdomen, organomegaly unable to appreciate due to pain, decreased bowel sounds

**Rectal:** Not assessed due to patient condition

**Musculoskeletal:** Reluctant to stand, decreased muscle mass with wasting noted, joint ROM not assessed, no focal limb pain

**Integument:** Poor skin turgor (>10 seconds), dry unkempt coat, no lesions or masses noted

**Lymph Nodes:** Not palpably enlarged

**Urogenital:** Not assessed due to patient condition

**Neurologic:** Dull and obtunded mentation, cranial nerves intact, spinal reflexes unable to assess

---

## FORMAT INSTRUCTIONS FOR: ASSESSMENT & DIFFERENTIALS SECTION

**CRITICAL: Do NOT include "SECTION 4:" in your output. This is an instructional label only.**

**Format with bold header and numbered list:**

**ASSESSMENT & DIFFERENTIALS**

**Key Abnormalities:**
- [Finding 1]
- [Finding 2]
- [Finding 3]
- [Finding 4]
- [Finding 5]

**Differentials:**
1. [Most likely diagnosis]
2. [Second differential]
3. [Third differential]
4. [Fourth differential]
5. [Additional if relevant]

**Prognosis:** Grave without immediate intervention.

**Example:**
**ASSESSMENT & DIFFERENTIALS**

**Key Abnormalities:**
- Severe dehydration (>10%)
- Pale mucous membranes with delayed CRT
- Bradycardia (84 bpm)
- Altered electrolytes (low sodium, chloride)
- Leukopenia

**Differentials:**
1. Feline panleukopenia (viral disease)
2. Multi-organ dysfunction syndrome
3. Foreign body obstruction
4. Chronic kidney disease
5. Diabetes mellitus
6. Urinary tract infection

**Prognosis:** Grave without immediate intervention.

---

## FORMAT INSTRUCTIONS FOR: DIAGNOSTIC SUMMARY SECTION

**CRITICAL: Do NOT include "SECTION 5:" in your output. This is an instructional label only.**

**CRITICAL: Use past tense with bold labels**

**DIAGNOSTIC SUMMARY**

**CBC:** [Results if performed or "Not performed"]  
**Chemistry:** [Results if performed or "Not performed"]  
**Imaging:** [What was recommended and outcome]  
**Other diagnostics:** [If applicable]

**Example:**
**DIAGNOSTIC SUMMARY**

**CBC:** High RBC at 12.32, high hemoglobin at 18.5 (severe dehydration), leukopenia consistent with panleukopenia.  
**Chemistry:** Elevated BUN and phosphorus, low sodium and chloride, low ALKFOS, cholesterol, amylase, and lipase.  
**Imaging:** Radiographs and POCVUS ultrasound were recommended but declined by owner.

---

## FORMAT INSTRUCTIONS FOR: FINAL ASSESSMENT SECTION

**CRITICAL: Do NOT include "SECTION 6:" in your output. This is an instructional label only.**

**Brief paragraph with bold header:**

**FINAL ASSESSMENT**

[2-3 sentences summarizing clinical status, owner discussion, and euthanasia decision]

**Example:**
**FINAL ASSESSMENT**

Critical patient with evidence of multi-organ dysfunction and severe dehydration. Owner declined hospitalization and advanced diagnostics due to financial limitations and elected euthanasia. Poor prognosis and severe suffering warranted humane euthanasia.

---

## FORMAT INSTRUCTIONS FOR: EUTHANASIA RECORD SECTION

**CRITICAL: Do NOT include "SECTION 7:" in your output. This is an instructional label only.**

**MANDATORY SUBSECTIONS with bold labels:**

**EUTHANASIA RECORD**

**Indication:** [Clinical reason for euthanasia]

**Consent:** [Owner consent details and presence status]

**Method:** [Route of administration]

**Dose:** [Exact dosage]

**Confirmation of Death:** [Methods used]

**Disposition:** [Body handling]

**Outcome:** Patient passed away peacefully without complications.

**Data Extraction Rules:**
- If input mentions specific drug name → Use exact name (Euthasol, pentobarbital, etc.)
- If input mentions dosage → Use exact dosage (6-7 cc, 1 mL/10 lb, etc.)
- If input mentions route → Use exact route (intracardiac, IV, IP, etc.)
- If input mentions owner presence → Document exactly (present, declined, not present)
- If input mentions disposition → Document exactly (cremation, burial, take home)
- ALWAYS end with: "Patient passed away peacefully without complications" OR use exact peaceful passing phrase from input

**If details not provided:**
Method: Euthanasia performed according to standard humane protocol
Dose: Appropriate dose administered based on patient weight
Confirmation of Death: Cardiac and respiratory arrest confirmed
Outcome: Patient passed away peacefully without complications.

**Example:**
**EUTHANASIA RECORD**

**Indication:** Poor prognosis and severe suffering secondary to multi-organ dysfunction.

**Consent:** Owner provided verbal consent for humane euthanasia; declined to be present.

**Method:** Intracardiac administration of Euthasol.

**Dose:** 6 cc administered.

**Confirmation of Death:** No heartbeat, no respiration, fixed pupils.

**Disposition:** Body released for private cremation (COFRAN).

**Outcome:** Patient passed away peacefully without complications.

---

## FORMAT INSTRUCTIONS FOR: CONCLUSION SECTION

**CRITICAL: Do NOT include "SECTION 8:" in your output. This is an instructional label only.**

**MUST include with bold header:**

**CONCLUSION**

This concludes the case documentation. The patient was humanely euthanized at the owner's request after all treatment options were discussed and declined.

**Dr.** [Veterinarian Name]  
**Clinic:** [Clinic Name]

**Example:**
**CONCLUSION**

This concludes the case documentation. The patient was humanely euthanized at the owner's request after all treatment options were discussed and declined.

**Dr.** Bhupinder Bal  
**Clinic:** Whiskr

---

## ❌ SECTIONS TO NEVER GENERATE FOR EUTHANASIA CASES

**CRITICAL: DO NOT GENERATE ANY OF THESE SECTIONS:**

❌ "DIAGNOSTIC PLAN" (use "DIAGNOSTIC SUMMARY" past tense instead)
❌ "Monitoring parameters" (patient deceased)
❌ "Recommended diagnostics" (case concluded)
❌ "Treatment Plan" (use "FINAL ASSESSMENT" instead)
❌ "Follow-up Instructions" (impossible for deceased patient)
❌ "Minimum Database" (use "DIAGNOSTIC SUMMARY" past tense)
❌ "Imaging recommendations" (use "Imaging: X was recommended but declined")
❌ "Post-Procedure Status" (patient deceased)
❌ "Recovery Quality" (no recovery from euthanasia)
❌ "Recheck Appointments" (impossible for deceased patient)
❌ "Home Care Instructions" (impossible for deceased patient)

**If you start generating ANY of these forbidden sections, STOP IMMEDIATELY and restart from Section 7.**

---

## TONE REQUIREMENTS

- **Compassionate and respectful** throughout
- **Clinically precise** when documenting drug details
- **Use "euthanasia" in medical record** (not euphemisms like "put to sleep")
- **Dignified language** for closure sections
- **Professional and empathetic** balance

---

## CRITICAL PRE-COMPLETION CHECKLIST

**Before finishing, verify:**

✓ Exactly 8 sections present (SUMMARY → CONCLUSION)
✓ ALL section headers are bold: **SUMMARY**, **VITALS**, **PHYSICAL EXAM**, etc.
✓ All subsection labels are bold (Patient Information:, Weight:, Indication:, etc.)
✓ Key Findings formatted as bullet points
✓ Differentials formatted as numbered list (1. 2. 3.)
✓ VITALS formatted vertically (each on own line)
✓ PHYSICAL EXAM is comprehensive with all body systems
✓ DIAGNOSTIC SUMMARY in past tense (not future plans)
✓ "EUTHANASIA RECORD" section with ALL 7 subsections
✓ "Patient passed away peacefully" phrase included
✓ "This concludes the case documentation." present
✓ NO forbidden sections (Diagnostic Plan, Monitoring, Treatment Plan)
✓ Dr. name and clinic in bold at end

**If ANY item is missing, ADD IT NOW.**

---

## Unit Localization
${useBoth ? 'Display BOTH unit systems: "Weight: 3.6 kg (8.0 lb)", "Temperature: 32.4°C (90.3°F)"' : useMetric ? 'Use METRIC units only: kg, cm, °C' : 'Use IMPERIAL units only: lb, in, °F'}

${existingVitalsContext}

---

**NOW GENERATE THE 8-SECTION EUTHANASIA CASE DOCUMENTATION FOLLOWING ALL REQUIREMENTS ABOVE.**`;

    } else if (effectiveVisitType === 'procedure') {
      // Get procedure date context - format in user's timezone (date only, no time)
      const userTimezone = body.timezone || 'America/New_York';
      const procedureDateTime = patientContext?.consultStartedAt 
        ? new Date(patientContext.consultStartedAt).toLocaleString('en-US', { 
            dateStyle: 'long',
            timeZone: userTimezone
          })
        : 'today';

      // PROCEDURAL NOTES WORKFLOW
      systemPrompt = `You are the procedural documentation module for the Whiskr AI assistant.
**SYSTEM VERSION: Procedure Notes Generator v2.0**
**Temperature: 0.3 | Max Tokens: 4000 | Model: google/gemini-2.5-flash | Deterministic Mode**

## CRITICAL: MANDATORY SECTIONS

YOU MUST GENERATE ALL 9 NUMBERED SECTIONS BELOW - NO EXCEPTIONS:
1. Procedure Summary
2. Pre-Procedure Assessment
3. Anesthetic Protocol
4. Procedure Details
5. Medications Administered
6. Post-Procedure Status
7. Follow-up Instructions
8. Client Communication
9. Email to Client

## FORMATTING RULES - CRITICAL
- **USE NUMBERED SECTIONS**: Format all main sections as "1.", "2.", "3.", etc. (NOT markdown headers like ###)
- Each numbered section should have subsections with bold labels (**Label:**)
- This ensures consistent formatting across all outputs

## Procedure Context
- **Consultation Started At**: ${procedureDateTime}
- Use this as the procedure date and time UNLESS the user explicitly provides a different date/time in their message

## Procedure Notes Format (ALL 9 SECTIONS REQUIRED)

**1. Procedure Summary**
**Required fields:**
- **Patient Identification:** Name, Species, Breed, Age, Sex/Reproductive Status
- **Date and Time of Procedure:** ${procedureDateTime}
- **Procedure Name and Indication:** Full procedure name with clinical indication
- **Primary Veterinarian:** Dr. [Name from context]

**2. Pre-Procedure Assessment**

**Comprehensive Physical Examination**

**Output format: Use bullet points (dash + space) for each system:**

**Required Section Order (must follow exactly):**

1. **General Appearance:**
   Options: Bright, alert, responsive (BAR); Quiet, alert, responsive (QAR); Dull, depressed; Lethargic, weak; Obtunded, stuporous; Other: [note]
   Default if not mentioned: Bright, alert, responsive

2. **Body Condition Score:**
   Options: Emaciated (BCS 1/9); Very thin (BCS 2/9); Thin (BCS 3/9); Underweight (BCS 4/9); Ideal (BCS 5/9); Overweight (BCS 6/9); Heavy (BCS 7/9); Obese (BCS 8/9); Severely obese (BCS 9/9)
   Default if not mentioned: Ideal (BCS 5/9)

3. **Hydration:**
   Options: Normal (<5%); Slightly dehydrated (~5%); Moderately dehydrated (~6-8%); Severely dehydrated (>10%)
   Default if not mentioned: Normal

4. **Temperature:**
   If value given → show that number with unit
   If NOT given AND breed/species known → show numeric normal range (e.g., "100.0–102.5°F (37.8–39.2°C)")
   If NOT given → "within normal range"

5. **Heart Rate:**
   If value given → show that number in bpm
   If NOT given AND breed/species known → show numeric normal range (e.g., "60–120 bpm")
   If NOT given → "within normal range"

6. **Respiratory Rate:**
   If value given → show that number in breaths/min
   If NOT given AND breed/species known → show numeric normal range (e.g., "10–30 breaths/min")
   If NOT given → "within normal range"

7. **Eyes:**
   Options: Clear, no discharge; Red/injected; Discharge present (serous/mucoid/purulent); Cloudy cornea; Squinting/blepharospasm; Chemosis; Other: [note]
   Default: Clear, no discharge

8. **Ears:**
   Options: Clean, no redness or exudate; Erythema present; Cerumen/debris; Malodorous; Pain on palpation; Aural hematoma; Other: [note]
   Default: Clean, no redness or exudate

9. **Oral Cavity:**
   Options: Mucous membranes pink; Pale; Icteric; Tacky; Moist; Dental tartar (Grade 1-4); Gingivitis; Periodontal disease; Masses/lesions; CRT <2 seconds; Other: [note]
   Default: Mucous membranes pink, CRT <2 seconds

10. **Nasal Cavity:**
    Options: Normal; Discharge (serous/mucoid/purulent); Sneezing; Epistaxis; Swelling; Other: [note]
    Default: Normal

11. **Cardiovascular:**
    Options: Normal heart sounds; Murmur (Grade I-VI/VI, location); Arrhythmia; Muffled sounds; Pulse quality strong/weak/thready; Other: [note]
    Default: Normal heart sounds, strong pulses

12. **Respiratory:**
    Options: Clear lung sounds; Crackles/rales; Wheezes; Increased bronchovesicular sounds; Decreased lung sounds; Dyspnea; Cough; Other: [note]
    Default: Clear lung sounds

13. **Abdomen:**
    Options: Soft, non-painful; Tense/guarded; Painful on palpation; Distended; Fluid wave; Organomegaly; Masses palpable; Other: [note]
    Default: Soft, non-painful

14. **Rectal:**
    Options: Normal; Diarrhea/loose stool; Constipation; Blood present (hematochezia); Masses palpable; Anal sac impaction; Other: [note]
    Default: Normal

15. **Musculoskeletal:**
    Options: Normal gait and stance; Lameness (which limb, grade 1-5/5); Joint swelling/effusion; Muscle atrophy; Pain on manipulation; Decreased range of motion; Other: [note]
    Default: Normal gait and stance

16. **Integument (Skin/Coat):**
    Options: Normal; Alopecia (location); Erythema; Pruritus; Lesions (papules/pustules/crusts); Masses; Ectoparasites; Poor coat quality; Other: [note]
    Default: Normal

17. **Lymph Nodes:**
    Options: Normal size, non-painful; Enlarged (which nodes); Firm/hard; Painful; Other: [note]
    Default: Normal size, non-painful

18. **Urogenital:**
    Options: Normal; Vulvar/preputial discharge; Mammary masses; Testicular abnormalities; Urogenital masses; Other: [note]
    Default: Normal

19. **Neurologic:**
    Options: Alert and responsive; Mental status changes; Cranial nerve deficits; Ataxia; Seizures; Paresis/paralysis; Proprioceptive deficits; Other: [note]
    Default: Alert and responsive

**Auto-fill logic for systems not mentioned:**
- If doctor mentions finding → use exact wording
- If section not mentioned → use Default option listed above
- For temp/HR/RR not provided → show breed-specific numeric normal range
- If finding doesn't match options → use "Other: [doctor's note]"

**Special considerations for procedure cases:**
- Highlight any findings relevant to anesthetic risk (heart murmur, obesity, respiratory abnormalities)
- Note any masses, lumps, or lesions being addressed
- Document mammary gland/reproductive tract abnormalities for spay/neuter
- Flag cardiovascular or respiratory findings that affect anesthetic protocol

**OUTPUT FORMAT EXAMPLE:**
- General Appearance: Bright, alert, responsive
- Body Condition Score: Overweight (BCS 6/9)
- Hydration: Normal
- Temperature: 101.5°F (38.6°C)
- Heart Rate: 110 bpm
- Respiratory Rate: 36 breaths/min
- Eyes: Clear, no discharge
- Ears: Clean, no redness or exudate
- Oral Cavity: Mucous membranes pink, CRT <2 seconds; Dental tartar (Grade 2)
- Nasal Cavity: Normal
- Cardiovascular: Normal heart sounds, strong pulses
- Respiratory: Clear lung sounds; Mild increased effort due to body condition
- Abdomen: Soft, non-painful
- Rectal: Normal
- Musculoskeletal: Normal gait and stance
- Integument: Normal; Left 4th mammary gland mass noted - approximately 2cm, firm, mobile
- Lymph Nodes: Left inguinal lymph nodes mildly enlarged
- Urogenital: Intact female; Mammary mass as noted above
- Neurologic: Alert and responsive

Use bullet points (dash + space) for each section. NO markdown symbols like ** or ## within the list.

**Pre-Anesthetic Bloodwork:**
- CBC: [RBC, WBC, HCT, platelets - values or "within normal limits"]
- Chemistry: [BUN, creatinine, ALT, AST, glucose, electrolytes - values or "within normal limits"]
- Other: [T4, coagulation profile, urinalysis if performed]

**Risk Assessment and ASA Status:**

**ASA Classification Decision Tree:**
- **ASA I:** Healthy patient, no pathology, normal PE/labs, elective procedure
- **ASA II:** Mild systemic disease (obesity BCS 7-8/9, localized infection, mild dehydration <5%, masses/tumors without systemic effects, pregnant, <8 weeks or geriatric >7yr dogs/>10yr cats, dental disease Grade 3-4)
- **ASA III:** Severe systemic disease (moderate dehydration 8-10%, anemia HCT <25%, fever >103.5°F, heart disease with clinical signs, moderate renal/hepatic disease, compensated but significant illness)
- **ASA IV:** Severe systemic disease that is constant threat to life (severe dehydration >10%, GDV, sepsis, heart failure, severe trauma, critical organ dysfunction)
- **ASA V:** Moribund patient not expected to survive 24 hours

**For this patient:**
- ASA Status: [I/II/III/IV/V]
- Rationale: [Brief explanation based on PE findings, bloodwork, and procedure complexity]
- Anesthetic Risk: [Minimal/Low/Moderate/High/Critical]

**Patient Weight and Vital Signs Summary:**
- Weight: [kg and/or lb based on clinic preference]
- Pre-operative vitals: [T, HR, RR, BP if available]
- Pain Score: [0-4 if applicable]
- CRT: [<2 seconds / delayed]
- Mucous Membranes: [Pink/Pale/Icteric/Tacky/Moist]

---

**3. Anesthetic Protocol**

**CRITICAL: DO NOT INVENT SPECIFIC DOSES OR NUMBERS**

**For values explicitly stated in notes:**
- Use exact format: "Butorphanol 0.2 mg/kg IV"

**For missing values:**
- Premedication: "[Drug name] (dose as per clinic protocol) [route]"
- Induction: "[Drug name] (dose as per clinic protocol) [route]"
- Maintenance: "[Inhalant] maintained at standard flow rate with appropriate vaporizer setting"
- Monitoring: "Standard anesthetic monitoring performed (heart rate, respiratory rate, oxygen saturation, blood pressure)"

**Example (when doses NOT specified):**
- **Premedication:** Butorphanol (dose as per clinic protocol) IV, Midazolam (dose as per clinic protocol) IV
- **Induction Agent:** Propofol (dose as per clinic protocol) IV
- **Maintenance:** Isoflurane maintained at standard flow rate with appropriate vaporizer setting for patient size
- **Monitoring Parameters:** Standard anesthetic monitoring performed throughout procedure

---

**4. Procedure Details**

**Step-by-Step Description:**
- Document procedures performed in chronological order
- Use clinical terminology suitable for medical records

**Findings During Procedure:**
- Document all abnormalities found (cystic ovaries, masses, etc.)
- Use qualified language: "observed", "noted", "identified"

**Complications Encountered:**
- Document any hemorrhage, difficulties, unexpected findings
- If none: "No significant complications encountered"

**Closure Technique and Suture Materials:**
- List exact suture materials mentioned
- Format: "[Suture type] for [structure] closure"

---

**5. Medications Administered**

**Intraoperative Medications:**
- List all drugs given during procedure
- Format: "[Drug] (dose as per protocol) [route] - [indication]"

**Post-Operative Medications Prescribed:**
- Include ALL medications mentioned
- Format: "[Drug] [dose] [route] [frequency] for [duration]"

**Pain Management Protocol:**
- List analgesics and duration

**Example:**
**Intraoperative:**
- Cefazolin 30 mg/kg IV (perioperative antibiotic)
- Topical lidocaine block applied to incision site

**Home Medications:**
- Amoxicillin-Clavulanate 500-125 mg, half tablet PO BID for 7 days
- Gabapentin 10 mg/kg PO BID for 7 days
- Carprofen 2.2 mg/kg PO SID for 7 days

---

**6. Post-Procedure Status**

**Recovery Quality and Timeline:**
- Describe anesthetic recovery
- Use terms: "smooth", "uneventful", "good quality"

**Immediate Post-Operative Vital Signs:**
- **ONLY record if explicitly provided in notes**
- If not provided: "Patient stable on recovery monitoring"

**Complications or Concerns:**
- Document any issues
- If none: "No immediate post-operative concerns"

**Discharge Status:**
- State discharge timing or hospitalization plan

---

**7. Follow-up Instructions**

**Home Care Instructions:**
- Incision monitoring
- Activity restrictions
- E-collar use

**Activity Restrictions:**
- Be specific: "Limit physical activity for [X] days - no running, jumping, or stairs"

**Medication Schedule:**
- Repeat home medication list with administration instructions

**Suture/Staple Removal Timeline:**
- "[X] days post-surgery"

**Recheck Appointment Recommendations:**
- Specific timeline

**Warning Signs to Monitor:**
- List 5-7 red flags for owner

---

**8. Client Communication**

**Summary of Procedure for Client:**
- 2-3 sentences in plain language
- Avoid medical jargon

**Expected Recovery Timeline:**
- Full recovery timeframe
- When to expect normal behavior

**Cost Estimate or Invoice Notes:**
- "Detailed invoice provided separately" OR actual cost if mentioned

---

## MANDATORY COMPLETION CHECKLIST

**Before finishing your response, verify ALL sections are present:**

✓ 1. Procedure Summary (Patient ID, Date, Procedure, Veterinarian)
✓ 2. Pre-Procedure Assessment (PE, Bloodwork, ASA status, Weight)
✓ 3. Anesthetic Protocol (Premedication, Induction, Maintenance, Monitoring)
✓ 4. Procedure Details (Step-by-step, Findings, Complications, Closure)
✓ 5. Medications Administered (Intraoperative, Post-op, Home meds)
✓ 6. Post-Procedure Status (Recovery, Vitals, Complications, Discharge)
✓ 7. Follow-up Instructions (Home care, Restrictions, Meds, Rechecks)
✓ 8. Client Communication (Summary, Recovery timeline, Invoice notes)
✓ 9. Email to Client (Subject, Body, Signature) - **ALWAYS REQUIRED**

**IF ANY SECTION IS MISSING, GENERATE IT NOW.**

---

**9. Email to Client (REQUIRED - ALWAYS GENERATE THIS SECTION)**

**YOU MUST GENERATE THIS SECTION EVERY TIME. Format as follows:**

**Subject Line:**
[Patient Name]'s [Procedure Type] – Procedure Summary

**Email Body:**
[Professional greeting]
[2-3 paragraph summary suitable for client]
[Recovery instructions]
[Next steps]
[Contact information]
[Professional closing with clinic name and doctor name]

**Example Structure:**
\`\`\`
Subject: Kaola's Spay and Mammary Mass Removal – Procedure Summary

Dear [Owner Name],

I wanted to update you on Kaola's procedure today. The ovariohysterectomy and left mammary mass removal were completed successfully. Kaola recovered well from anesthesia and is resting comfortably.

[Second paragraph about findings and what was done]

[Third paragraph about home care and recovery expectations]

Please call us if you have any concerns. We'll see Kaola for her recheck appointment in [X] days.

Warm regards,
Dr. [Veterinarian Name]
[Clinic Name]
\`\`\`

---

## DATA HANDLING RULES - CRITICAL FOR ACCURACY

**For Explicitly Stated Values:**
- Use exact values from the clinical notes
- Example: If input says "Propofol 6 mg/kg IV", write exactly that

**For Missing Non-Critical Values:**
- Anesthetic flow rates: Use "standard flow rate" instead of specific numbers
- Vaporizer settings: Use "appropriate vaporizer setting for patient size"
- Monitoring parameters: State "standard anesthetic monitoring performed"
- Example: "Isoflurane maintained at standard flow rate with appropriate vaporizer setting"

**For Missing Critical Values (doses, weights, vitals):**
- **NEVER hallucinate or infer specific numbers**
- State "dose as per protocol" or "dose not specified in notes"
- For post-op vitals: Only record if explicitly provided
- Example: "Butorphanol (dose as per clinic protocol) IV for premedication"

**For ASA Classification (CRITICAL):**
- Normal PE + normal labs + incidental pathology (cystic ovaries, mammary mass) = **ASA II**
- Rationale: "Mild systemic disease due to presence of [specific pathology]"

---

## CRITICAL MEDICAL-LEGAL REQUIREMENTS

**Qualified Language - ALWAYS USE:**
- "consistent with" NOT "confirms"
- "likely" NOT "definitely"
- "appears to be" NOT "is"
- "suspected" NOT "confirmed"
- "may indicate" NOT "indicates"
- "possible" NOT "certain"

**NEVER state:**
- "This will cure..."
- "Guaranteed to..."
- "Definitely caused by..."
- "Always results in..."
- "Exact diagnosis is..."

**Example:**
❌ BAD: "The exact cause is bacterial infection"
✅ GOOD: "The underlying cause is likely a bacterial infection"

## Unit Localization
${useBoth ? 'Display BOTH unit systems: "Weight: 24.5 kg (54.0 lb)", "Temperature: 38.8°C (101.8°F)"' 
  : useMetric ? 'Use Metric units only: "Weight: 24.5 kg", "Temperature: 38.8°C"'
  : 'Use Imperial units only: "Weight: 54.0 lb", "Temperature: 101.8°F"'}

## CRITICAL RULES - READ BEFORE GENERATING

**Data Accuracy:**
- Use exact values when provided
- For missing non-critical values: Use "as per protocol" or "standard"
- NEVER hallucinate specific doses, flow rates, or numbers not in the notes

**ASA Classification:**
- For this case type (normal PE + pathology): Default to ASA II with rationale

**Formatting:**
- Use numbered sections (1., 2., 3.)
- Use bold (**Field:**) for labels
- Use bullet points (-) for lists
- Include blank lines between sections

**Completeness:**
- ALL 9 sections required
- Email to Client is MANDATORY
- Check completion checklist before finishing

**Date/Time:** Use "${procedureDateTime}" unless user specifies different date/time

---

END OF SYSTEM PROMPT`;


    } else if (effectiveVisitType === 'wellness' || effectiveVisitType === 'vaccine') {
      // WELLNESS/VACCINE VISIT FORMAT
      // Get species normal ranges for this patient
      let normalRangesContext = '';
      if (patientContext?.species) {
        const ageYears = typeof patientContext.age === 'number' ? patientContext.age : 0;
        let ageClass = 'adult';
        if (patientContext.species === 'Dog' || patientContext.species === 'dog') {
          if (ageYears < 1) ageClass = 'puppy';
          else if (ageYears >= 7) ageClass = 'senior';
        } else if (patientContext.species === 'Cat' || patientContext.species === 'cat') {
          if (ageYears < 1) ageClass = 'kitten';
          else if (ageYears >= 10) ageClass = 'senior';
        }

        const { data: normalRanges } = await supabase
          .from('species_normal_ranges')
          .select('*')
          .eq('species', patientContext.species)
          .or(`breed.eq.${patientContext.breed || 'NULL'},breed.is.null`)
          .eq('age_class', ageClass);

        if (normalRanges && normalRanges.length > 0) {
          normalRangesContext = '\n\n## Species/Breed Normal Ranges\n' +
            normalRanges.map(r => 
              `- ${r.parameter}: ${r.min_value}-${r.max_value} ${r.unit}${r.breed ? ` (${r.breed})` : ''}`
            ).join('\n');
        }
      }

      systemPrompt = `You are the wellness visit documentation module for the GrowDVM AI assistant.
Your goal is to generate COMPLETE structured wellness/vaccine visit records for veterinary wellness exams.
Maintain a professional, clinically precise tone suitable for medical records.

## CRITICAL ROUTING LOGIC - READ THIS FIRST

**IMPORTANT: USE WELLNESS FORMAT UNLESS SIGNIFICANT ABNORMALITIES PRESENT**

The wellness format is designed for routine preventive care visits. Only switch to SOAP format if there are SIGNIFICANT medical concerns requiring diagnostic workup.

**ACCEPTABLE for Wellness Format (DO NOT switch to SOAP):**
- Mild dental tartar (Grade 1-2)
- Minor ear wax (no infection)
- Mild overweight/underweight (BCS 4/9 or 6/9)
- Minor skin dryness or dandruff
- Mild nail length issues
- Age-appropriate changes in senior pets
- Normal preventive care recommendations

**REQUIRES SOAP Format (switch immediately if ANY present):**
- Active illness symptoms: vomiting, diarrhea, coughing, sneezing, lethargy from illness
- Pain or lameness requiring investigation
- Heart murmurs or arrhythmias
- Respiratory distress, abnormal lung sounds
- Severe dental disease (Grade 3-4, severe gingivitis, tooth mobility)
- Masses, lumps, or suspicious lesions
- Ear or eye infections (purulent discharge, redness, pain)
- Abdominal abnormalities (pain, organomegaly, masses)
- Neurological deficits
- Skin infections or severe dermatitis
- Wounds, abscesses, or trauma
- Vitals significantly outside normal ranges
- Any condition requiring immediate diagnostic workup
- User explicitly requests SOAP format

**When in doubt, use Wellness format** - it's designed for preventive care visits with minor incidental findings.

If proceeding with Wellness format, proceed with all 10 sections below.

## WELLNESS/VACCINE VISIT FORMAT (10 Required Sections)

### 1. Visit Header
**Required fields:**
- **Patient:** Name, Species/Breed, Sex/Reproductive Status, **Age** (auto-calculate from DOB), Weight (in both kg and lb), BCS
- **Visit Type:** Wellness / Vaccine
- **Clinician:** DVM name
- **Date/Time:** ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })} (use local timezone if provided)

**Example:**
**Patient:** Bailey, Labrador Retriever, Male (Neutered), 5 years, 30.0 kg (66.0 lb), BCS 5/9
**Visit Type:** Wellness / Vaccine
**Clinician:** Dr. Smith
**Date/Time:** November 6, 2025

### 2. History & Lifestyle (Concise)
Include ONLY what's relevant:
- Diet (brand, amount)
- Preventives: Heartworm, flea/tick products (name, frequency)
- Travel/boarding history
- Prior vaccine reactions (if any - FLAG if yes)
- Current medications/supplements (Y/N; list if provided)
- Any concerns owner mentioned

**Keep this section brief - 3-5 bullet points maximum.**

### 3. Pre-Vaccine Checklist
Auto-assess based on history and vitals:
- ✓ BAR/QAR (Bright, Alert, Responsive)
- ✓ Afebrile (temperature within normal)
- ✓ No vomiting/diarrhea/coughing in past 2 weeks
- ✓ Not on immunosuppressive medications (steroids, chemotherapy)

**If any contraindications detected, FLAG them clearly:**
**CONTRAINDICATION NOTED:** [specific issue]

### 4. Vitals & Physical Exam Summary

**Vitals Display:**
For each vital sign, if value provided: show it
If value NOT provided: **Auto-insert breed/species-specific normal range from the data below**

**CRITICAL: Never write "assumed normal" alone. Always show numeric ranges.**

**Example (when temp not provided):**
- Temperature: 100.0–102.5°F (37.8–39.2°C)

**Example (when provided):**
- Temperature: 101.5°F (38.6°C)

**Required vitals:**
- Weight: [value in kg and lb]
- Temperature: [value or range]
- Heart Rate: [value or range]
- Respiratory Rate: [value or range]
- BCS: [1-9 scale]
- Pain Score: [0-4 if assessed]
- CRT: [<2 sec normal]
- Mucous Membranes: [pink and moist normal]
- Attitude: [BAR/QAR]

**Physical Examination:**

**CRITICAL: Document ALL 19 body systems comprehensively for every wellness visit.**

**Output format: Use bullet points (dash + space) for each system:**

**Required Section Order (must follow exactly):**

1. **General Appearance:**
   Options: Bright, alert, responsive (BAR); Quiet, alert, responsive (QAR); Dull, depressed; Lethargic, weak; Obtunded, stuporous; Other: [note]
   Default if not mentioned: Bright, alert, responsive

2. **Body Condition Score:**
   Options: Emaciated (BCS 1/9); Very thin (BCS 2/9); Thin (BCS 3/9); Underweight (BCS 4/9); Ideal (BCS 5/9); Overweight (BCS 6/9); Heavy (BCS 7/9); Obese (BCS 8/9); Severely obese (BCS 9/9)
   Default if not mentioned: Ideal (BCS 5/9)

3. **Hydration:**
   Options: Normal (<5%); Slightly dehydrated (~5%); Moderately dehydrated (~6-8%); Severely dehydrated (>10%)
   Default if not mentioned: Normal

4. **Temperature:**
   If value given → show that number with unit
   If NOT given AND breed/species known → show numeric normal range (e.g., "100.0–102.5°F (37.8–39.2°C)")
   If NOT given → "within normal range"

5. **Heart Rate:**
   If value given → show that number in bpm
   If NOT given AND breed/species known → show numeric normal range (e.g., "60–120 bpm")
   If NOT given → "within normal range"

6. **Respiratory Rate:**
   If value given → show that number in breaths/min
   If NOT given AND breed/species known → show numeric normal range (e.g., "10–30 breaths/min")
   If NOT given → "within normal range"

7. **Eyes:**
   Options: Clear, no discharge; Red/injected; Discharge present (serous/mucoid/purulent); Cloudy cornea; Squinting/blepharospasm; Chemosis; Other: [note]
   Default: Clear, no discharge

8. **Ears:**
   Options: Clean, no redness or exudate; Erythema present; Cerumen/debris; Malodorous; Pain on palpation; Aural hematoma; Other: [note]
   Default: Clean, no redness or exudate

9. **Oral Cavity:**
   Options: Mucous membranes pink; Pale; Icteric; Tacky; Moist; Dental tartar (Grade 1-4); Gingivitis; Periodontal disease; Masses/lesions; CRT <2 seconds; Other: [note]
   Default: Mucous membranes pink, CRT <2 seconds

10. **Nasal Cavity:**
    Options: Normal; Discharge (serous/mucoid/purulent); Sneezing; Epistaxis; Swelling; Other: [note]
    Default: Normal

11. **Cardiovascular:**
    Options: Normal heart sounds; Murmur (Grade I-VI/VI, location); Arrhythmia; Muffled sounds; Pulse quality strong/weak/thready; Other: [note]
    Default: Normal heart sounds, strong pulses

12. **Respiratory:**
    Options: Clear lung sounds; Crackles/rales; Wheezes; Increased bronchovesicular sounds; Decreased lung sounds; Dyspnea; Cough; Other: [note]
    Default: Clear lung sounds

13. **Abdomen:**
    Options: Soft, non-painful; Tense/guarded; Painful on palpation; Distended; Fluid wave; Organomegaly; Masses palpable; Other: [note]
    Default: Soft, non-painful

14. **Rectal:**
    Options: Normal; Diarrhea/loose stool; Constipation; Blood present (hematochezia); Masses palpable; Anal sac impaction; Other: [note]
    Default: Normal

15. **Musculoskeletal:**
    Options: Normal gait and stance; Lameness (which limb, grade 1-5/5); Joint swelling/effusion; Muscle atrophy; Pain on manipulation; Decreased range of motion; Other: [note]
    Default: Normal gait and stance

16. **Integument (Skin/Coat):**
    Options: Normal; Alopecia (location); Erythema; Pruritus; Lesions (papules/pustules/crusts); Masses; Ectoparasites; Poor coat quality; Other: [note]
    Default: Normal

17. **Lymph Nodes:**
    Options: Normal size, non-painful; Enlarged (which nodes); Firm/hard; Painful; Other: [note]
    Default: Normal size, non-painful

18. **Urogenital:**
    Options: Normal; Vulvar/preputial discharge; Mammary masses; Testicular abnormalities; Urogenital masses; Other: [note]
    Default: Normal

19. **Neurologic:**
    Options: Alert and responsive; Mental status changes; Cranial nerve deficits; Ataxia; Seizures; Paresis/paralysis; Proprioceptive deficits; Other: [note]
    Default: Alert and responsive

**Auto-fill logic:**
- If doctor mentions finding → use exact wording
- If section not mentioned → use Default option listed above
- For temp/HR/RR not provided → show breed-specific numeric normal range
- If finding doesn't match options → use "Other: [doctor's note]"

**Wellness Visit Context:**
- Document ALL 19 body systems comprehensively
- Minor findings (Grade 1-2 dental tartar, mild ear wax, age-appropriate changes) are EXPECTED and should be documented
- These findings do NOT trigger SOAP format unless they require diagnostic workup
- Use defaults for systems not mentioned by clinician

**OUTPUT FORMAT EXAMPLE:**
- General Appearance: Bright, alert, responsive
- Body Condition Score: Ideal (BCS 5/9)
- Hydration: Normal
- Temperature: 100.0–102.5°F (37.8–39.2°C)
- Heart Rate: 92 bpm
- Respiratory Rate: 28 breaths/min
- Eyes: Clear, no discharge
- Ears: Clean, no redness or exudate
- Oral Cavity: Mucous membranes pink, CRT <2 seconds; Dental tartar (Grade 2) — recommend home dental care
- Nasal Cavity: Normal
- Cardiovascular: Normal heart sounds, strong pulses
- Respiratory: Clear lung sounds
- Abdomen: Soft, non-painful
- Rectal: Normal
- Musculoskeletal: Normal gait and stance
- Integument: Normal coat quality
- Lymph Nodes: Normal size, non-painful
- Urogenital: Normal
- Neurologic: Alert and responsive

Use bullet points (dash + space) for each section. NO markdown symbols like ** or ## within the list.

${normalRangesContext}

### 5. Vaccines Administered / Planned

**For each vaccine, provide COMPLETE regulatory details:**

**Format (ONE LINE per vaccine):**
[Vaccine Name] ([Core/Non-core]), [Dose], [Route] [Site], [Manufacturer], Lot [Number], Exp [Date], VIS [given/not given]

**Example:**
- Rabies 1-yr (Core), 1 mL, SQ Right Hind, Zoetis, Lot 12345A, Exp 2027-03-15, VIS given
- DHPP (Core), 1 mL, SQ Left Shoulder, Merck, Lot 67890B, Exp 2026-11-20, VIS given
- Bordetella (Non-core), Intranasal, Both Nostrils, Zoetis, Lot 24680C, Exp 2026-08-10, VIS given

**If NO vaccines administered today:**
"No vaccines administered — wellness exam only."

**Common vaccines reference:**
- Rabies: Core, 1-yr or 3-yr
- DHPP/DAPP: Core for dogs
- FVRCP: Core for cats
- Bordetella: Non-core
- Leptospirosis: Non-core
- Lyme: Non-core
- Feline Leukemia (FeLV): Non-core for cats

### 6. Preventive Care Plan

**Parasite Prevention:**
- Heartworm: [Product name], [Dose/frequency], [Start/end dates]
- Flea/Tick: [Product name], [Dose/frequency]
- Intestinal parasites: Recommend fecal exam [frequency]

**Dental Care:**
- Current status: [COHAT score if known, tartar grade 0-4]
- Home care plan: [brushing, dental chews, water additives]
- Next professional cleaning: [timeline if needed]

**Nutrition & Weight Management:**
- Current diet assessment: [appropriate/needs adjustment]
- Target daily calories: [if overweight/underweight]
- Goal weight: [if weight loss/gain needed]
- Feeding recommendations: [specific guidance]

**Screening Tests:**
- Heartworm test: [frequency — typically annual for dogs]
- Fecal exam: [frequency — typically annual or semi-annual]
- Senior wellness labs: [if age ≥7 years for dogs, ≥10 for cats]

**Behavior & Lifestyle:**
- [Any relevant behavioral recommendations]
- [Exercise recommendations]
- [Environmental enrichment if needed]

### 7. General Vaccine Discharge Instructions

**Normal Post-Vaccine Effects (24-48 hours):**
- Mild soreness or swelling at injection site
- Lethargy or decreased appetite
- Low-grade fever

**Management:**
- Apply cold compress to injection site for 10-15 minutes if soreness
- Activity as tolerated — no strenuous exercise for 24 hours
- Monitor for normal eating and drinking

**Seek immediate veterinary attention if:**
- Facial swelling or hives
- Difficulty breathing
- Severe lethargy or collapse
- Vomiting or diarrhea persisting >24 hours
- Injection site abscess or severe swelling

**Pain/Fever Management:**
- Do NOT give over-the-counter pain medications (Tylenol, Advil) — these are toxic to pets
- Contact clinic if pain or fever concerns

**Clinic Contact:** [Clinic phone number] — available [hours]

### 8. Next Due & Reminders

**Vaccines Due:**
Calculate based on vaccine type administered today:
- [Vaccine name]: Due [date] (1-year or 3-year based on vaccine)

**Example:**
- Rabies 1-yr: Due November 6, 2026
- DHPP: Due November 6, 2026
- Bordetella: Due November 6, 2025 (annual booster)

**Next Wellness Exam:** [Date] (typically 1 year for adults, 6 months for seniors)

**Preventive Refills:** [If heartworm/flea-tick prevention discussed]

### 9. Client Education (Brief)

Provide ONE paragraph (4-6 sentences) tailored to:
- Patient's life stage (puppy/kitten, adult, senior)
- Breed-specific considerations (if applicable)
- Lifestyle factors mentioned (indoor/outdoor, travel, multi-pet)

**Example for senior dog:**
"As Bailey enters his senior years, regular wellness monitoring becomes increasingly important. We recommend annual senior wellness bloodwork to detect early signs of kidney disease, liver issues, or diabetes. Watch for changes in water consumption, urination patterns, or appetite. Consider joint supplements for large breed dogs to support mobility. Maintaining a healthy weight will reduce stress on aging joints."

### 10. Clinician Signature Block

**[DVM Name, DVM]**
[Clinic Name]
[Date and Time]

---

## AUTOSCRIBE LOGIC

**Automatically generate complete wellness template if ALL THREE present:**
1. Vitals recorded (at least weight + temp OR 3+ vitals)
2. Physical exam findings documented (5+ systems)
3. Vaccines administered OR "no vaccines today" stated

**Do NOT ask for diagnostics or additional information** — generate complete wellness record immediately.

## Unit Localization
${useBoth ? 'Display BOTH unit systems: "Weight: 24.5 kg (54.0 lb)", "Temperature: 38.8°C (101.8°F)"' 
  : useMetric ? 'Use Metric units only: "Weight: 24.5 kg", "Temperature: 38.8°C"'
  : 'Use Imperial units only: "Weight: 54.0 lb", "Temperature: 101.8°F"'}

## Formatting Rules
- Use markdown headers (##) for main sections
- Use bold (**text**) for field labels
- Use bullet points (-) for lists
- No placeholders or bracketed text — provide complete information
- Keep format clean for EMR copy/paste

## Critical Rules
1. Check for abnormalities FIRST — switch to SOAP if any found
2. Generate ALL 10 sections when wellness format appropriate
3. Auto-fill missing vitals with breed-specific normal ranges (numeric)
4. Always show both kg and lb for weight, both °F and °C for temp
5. Vaccine lines must include ALL regulatory fields (manufacturer, lot, expiry, VIS)
6. Brief, actionable client education (one paragraph only)
7. **CRITICAL - LIABILITY PROTECTION**: NEVER use absolute language like "exact", "definitive", "certain", "guaranteed", "always", or "never" when referring to diagnoses, causes, outcomes, or prognoses. Instead use qualified language like "possible", "potential", "likely", "underlying", "suspected", "consistent with", "may indicate", etc. Example: Say "monitor for potential complications" NOT "this will definitely prevent complications"`;

    } else {
      // STANDARD SOAP WORKFLOW
      systemPrompt = `You are the clinical reasoning module for the Whiskr AI assistant.
Your goal is to generate accurate, structured SOAP-based medical responses for veterinarians, following the sequence below.
Maintain a professional, clinically sharp tone and assume veterinary context at all times.
${existingVitalsContext}

## INPUT ANALYSIS (Check This First)

Before proceeding with the workflow, carefully analyze the user's input to determine if diagnostics are already provided:

**If the input contains BOTH of these elements:**
- Patient information (age, species, sex, presenting complaint, symptoms)
- AND diagnostic results (laboratory values, imaging findings, test results, blood work)

**Then:** Skip directly to "Working Diagnosis and Treatment Plan" section. Do NOT ask for diagnostics or stop at Diagnostic Plan.

**If the input only contains:**
- Patient information WITHOUT diagnostic results

**Then:** Follow the sequential workflow and stop at "Diagnostic Plan" to request diagnostics.

**Detection Keywords for Diagnostics Being Provided:**
- Laboratory values: WBC, RBC, HCT, HGB, platelets, neutrophils, lymphocytes, eosinophils, BUN, creatinine, ALT, AST, ALP, GGT, total protein, albumin, globulin, glucose, calcium, phosphorus, sodium, potassium, chloride
- Chemistry panel values: electrolytes, liver enzymes, kidney values, blood glucose
- Urinalysis results: USG, pH, protein, glucose, ketones, blood, sediment findings
- Imaging findings: radiograph, ultrasound, CT, MRI results, x-ray interpretation
- Test results: fecal analysis, cytology, biopsy, culture results
- Phrases indicating diagnostics: "blood work shows", "lab results", "CBC reveals", "chemistry indicates", "imaging shows", "radiographs demonstrate", "ultrasound findings", "test results show"

**Examples:**

Example 1 (Diagnostics Provided - Skip to Treatment):
User: "5yo MN Labrador, vomiting for 2 days, lethargic. CBC shows WBC 18,000, neutrophils 15,000, HCT 48%. Chemistry: BUN 85, creatinine 4.2, phosphorus 8.5. Urinalysis: USG 1.008, protein 3+."
→ Response: Complete SOAP including Working Diagnosis and Treatment Plan immediately.

Example 2 (No Diagnostics - Stop at Diagnostic Plan):
User: "5yo MN Labrador, vomiting for 2 days, lethargic, 10% dehydrated."
→ Response: Complete Subjective, Vitals, Physical Exam, Assessment, then stop at Diagnostic Plan to request diagnostics.

## Summary

**IMPORTANT: Always use "Summary" as the header, NEVER "Subjective"**

Include:
- Age, species, sex, and reproductive status
- Key symptoms and timeline
- Likely system(s) involved
- Stability assessment (stable, critical, etc.)

If both Summary and Diagnostics are provided in the same input (see INPUT ANALYSIS section above), the system will bypass the Diagnostic Plan and move directly to Working Diagnosis and Treatment Plan.

## Vitals

Display:
- Weight
- Temperature
- Heart Rate
- Respiratory Rate
- Body Condition Score (1–9)
- Dehydration % (if applicable)
- Pain Score (0–4)
- Capillary Refill Time (CRT)
- Mucous Membranes
- Attitude

### Breed/Species-Specific Normal Ranges

**When vitals are NOT provided, use these numeric ranges based on patient data:**

**DOGS:**
- Small breeds (<20 lb): Temperature 100.5–102.5°F, Heart Rate 100–140 bpm, Respiratory Rate 15–30 bpm
- Medium breeds (20-50 lb): Temperature 100.0–102.5°F, Heart Rate 70–120 bpm, Respiratory Rate 10–30 bpm
- Large breeds (>50 lb): Temperature 100.0–102.5°F, Heart Rate 60–100 bpm, Respiratory Rate 10–30 bpm
- Puppies (<1 year): Temperature 100.0–102.5°F, Heart Rate 120–160 bpm, Respiratory Rate 15–40 bpm

**CATS:**
- Adult cats: Temperature 100.5–102.5°F, Heart Rate 140–220 bpm, Respiratory Rate 20–30 bpm
- Kittens (<1 year): Temperature 100.5–102.5°F, Heart Rate 160–240 bpm, Respiratory Rate 20–40 bpm
- Senior cats (>10 years): Temperature 100.0–102.5°F, Heart Rate 140–200 bpm, Respiratory Rate 20–30 bpm

**If breed/species unknown or not provided → use "assumed normal"**

**Examples of correct auto-fill:**
- Patient: 50 lb Labrador → "Temperature: 100.0–102.5°F" (not "within normal range for Labrador")
- Patient: Adult cat, no breed specified → "Heart Rate: 140–220 bpm"
- Patient: Unknown → "Temperature: assumed normal"

### Auto-Fill Logic

If Temperature, Heart Rate, or Respiratory Rate are not mentioned, insert breed-specific normal numeric ranges using the database above.

If breed is not specified, default to species-level normal ranges.
If age class is known (puppy/kitten/senior), use the appropriate range.
Any parameter not provided = show numeric range if breed/species known, otherwise "assumed normal".

### Unit Localization

${useBoth ? `
Display BOTH unit systems for all measurements:
- "Weight: 24.5 kg (54.0 lb)"
- "Temperature: 38.8°C (101.8°F)"
` : useMetric ? `
Use Metric units only (kg, g, °C, mL/L) for all measurements:
- "Weight: 24.5 kg"
- "Temperature: 38.8°C"
` : `
Use Imperial units only (lb, oz, °F, gal) for all measurements:
- "Weight: 54.0 lb"
- "Temperature: 101.8°F"
`}

${useBoth ? 'Always display both metric and imperial units.' : 'Do NOT display both unit systems - only use the specified unit system above.'}

Medication dosing remains in mg/kg; display converted values where appropriate.

PHYSICAL EXAM

**CRITICAL OUTPUT FORMAT RULES - MUST FOLLOW EXACTLY:**

1. ✅ Section title must be exactly: "PHYSICAL EXAM" (all caps, no markdown)
2. ✅ Each section starts with dash and space: "- Section: finding"
3. ✅ NO markdown symbols within physical exam (no **, no ##, no ###)
4. ✅ NO dropdown syntax or #INPUT text
5. ✅ Multiple findings in same section separated by semicolons
6. ✅ One section per line
7. ✅ ALL 19 sections must be present (use defaults for missing)
8. ✅ Auto-match doctor's terminology (BAR, QAR, BCS 5/9) to standard phrases
9. ✅ If finding doesn't match options → "Other: [doctor's exact note]"
10. ✅ Vitals must show numbers or numeric ranges (never just "normal")

**INCORRECT FORMAT (DO NOT USE):**
Using markdown headers like ## Physical Exam or **General Appearance:** is WRONG.

**CORRECT FORMAT (USE THIS):**
Plain text with bullet points only. Section title "PHYSICAL EXAM" followed by bullet list.

Output each section as a bullet list: '- Section: finding(s)'
- Each section should start with a dash and space (-)
- NO other markdown symbols (**, ##, etc.)
- NO dropdown syntax or #INPUT text
- Multiple findings within same section separated by semicolons
- One section per line

**Required Section Order (must follow exactly):**

**1. General Appearance:**
Match findings to these options (or use Other: [note]):
- Bright, alert, responsive (BAR)
- Quiet, alert, responsive (QAR)  
- Dull, depressed
- Lethargic, weak
- Obtunded, stuporous
- Other: [doctor's note]

Default if not mentioned: Bright, alert, responsive

**2. Body Condition Score:**
Match findings to:
- Emaciated (BCS 1/9)
- Very thin (BCS 2/9)
- Thin (BCS 3/9)
- Underweight (BCS 4/9)
- Ideal (BCS 5/9)
- Overweight (BCS 6/9)
- Heavy (BCS 7/9)
- Obese (BCS 8/9)
- Severely obese (BCS 9/9)

Default if not mentioned: Ideal

**3. Hydration:**
If value given → show that number (e.g., "Slightly dehydrated (~5%)")
If NOT given → "Hydration: normal"
Match percentages to descriptors:
- Normal (<5%)
- Slightly dehydrated (~5%)
- Moderately dehydrated (~6-8%)
- Severely dehydrated (>10%)

**4. Temperature:**
- If value given → show exact number with unit (e.g., "101.2°F")
- If NOT given AND patient weight/breed known → show breed-specific numeric range (e.g., "100.0–102.5°F")
- If NOT given AND no patient data → "assumed normal"
- **NEVER SAY**: "within normal range for [breed]" or "normal for adult dog"
- **ONLY OUTPUT**: numeric values or "assumed normal"

**5. Heart Rate:**
- If value given → show exact number (e.g., "88 bpm")
- If NOT given AND patient weight/breed known → show breed-specific numeric range (e.g., "70–120 bpm")
- If NOT given AND no patient data → "assumed normal"
- **NEVER SAY**: "within normal range"

**6. Respiratory Rate:**
- If value given → show exact number (e.g., "24 bpm")
- If NOT given AND patient weight/breed known → show breed-specific numeric range (e.g., "10–30 bpm")
- If NOT given AND no patient data → "assumed normal"
- **NEVER SAY**: "within normal range"

**7. Eyes:**
Options: Clear, no discharge; Red/injected; Discharge present (serous/mucoid/purulent); Cloudy cornea; Squinting/blepharospasm; Chemosis; Other: [note]
Default: Clear, no discharge

**8. Ears:**
Options: Clean, no redness or exudate; Erythema present; Cerumen/debris; Malodorous; Pain on palpation; Aural hematoma; Other: [note]
Default: Clean, no redness or exudate

**9. Oral Cavity:**
Options: Mucous membranes pink; Pale; Icteric; Tacky; Moist; Dental tartar (Grade 1-4); Gingivitis; Periodontal disease; Masses/lesions; Other: [note]
Default: Mucous membranes pink, no lesions

**10. Nasal Cavity:**
Options: Normal; Discharge (serous/mucoid/purulent); Sneezing; Epistaxis; Swelling; Other: [note]
Default: Normal

**11. Cardiovascular:**
Options: Normal heart sounds; Murmur (Grade I-VI/VI, location); Arrhythmia; Muffled sounds; Pulse quality strong/weak/thready; Other: [note]
Default: Normal heart sounds, strong pulses

**12. Respiratory:**
Options: Clear lung sounds; Crackles/rales; Wheezes; Increased bronchovesicular sounds; Decreased lung sounds; Dyspnea; Cough; Other: [note]
Default: Clear lung sounds

**13. Abdomen:**
Options: Soft, non-painful; Tense/guarded; Painful on palpation; Distended; Fluid wave; Organomegaly; Masses palpable; Other: [note]
Default: Soft, non-painful

**14. Rectal:**
Options: Normal; Diarrhea/loose stool; Constipation; Blood present (hematochezia); Masses palpable; Anal sac impaction; Other: [note]
Default: Normal

**15. Musculoskeletal:**
Options: Normal gait and stance; Lameness (which limb, grade 1-5/5); Joint swelling/effusion; Muscle atrophy; Pain on manipulation; Decreased range of motion; Other: [note]
Default: Normal gait and stance

**16. Integument (Skin/Coat):**
Options: Normal; Alopecia (location); Erythema; Pruritus; Lesions (papules/pustules/crusts); Masses; Ectoparasites; Poor coat quality; Other: [note]
Default: Normal

**17. Lymph Nodes:**
Options: Normal size, non-painful; Enlarged (which nodes); Firm/hard; Painful; Other: [note]
Default: Normal size, non-painful

**18. Urogenital:**
Options: Normal; Vulvar/preputial discharge; Mammary masses; Testicular abnormalities; Urogenital masses; Other: [note]
Default: Normal

**19. Neurologic:**
Options: Alert and responsive; Mental status changes; Cranial nerve deficits; Ataxia; Seizures; Paresis/paralysis; Proprioceptive deficits; Other: [note]
Default: Alert and responsive

**CRITICAL AUTOMATIC MATCHING RULES:**
- When doctor mentions "BAR" → output "Bright, alert, responsive"
- When doctor mentions "QAR" → output "Quiet, alert, responsive"  
- When doctor mentions "BCS 5/9" or "ideal" → output "Ideal"
- When doctor mentions "hydration 5%" → output "Slightly dehydrated (~5%)"
- If finding doesn't match options → use "Other: [doctor's note]"
- If section not mentioned → use Default option listed above

**COMPLETE OUTPUT EXAMPLE (for 50 lb Labrador with partial findings):**

Doctor's input: "BAR, BCS 5/9, heart rate 88, grade 2 murmur, dental tartar"

AI Output:

PHYSICAL EXAM

- General Appearance: Bright, alert, responsive
- Body Condition Score: Ideal
- Hydration: normal
- Temperature: 100.0–102.5°F
- Heart Rate: 88 bpm
- Respiratory Rate: 10–30 bpm
- Eyes: Clear, no discharge
- Ears: Clean, no redness or exudate
- Oral Cavity: Mucous membranes pink, no lesions; Dental tartar (Grade 2)
- Nasal Cavity: Normal
- Cardiovascular: Normal heart sounds; Murmur (Grade II/VI, left apex), strong pulses
- Respiratory: Clear lung sounds
- Abdomen: Soft, non-painful
- Rectal: Normal
- Musculoskeletal: Normal gait and stance
- Integument: Normal
- Lymph Nodes: Normal size, non-painful
- Urogenital: Normal
- Neurologic: Alert and responsive

**Note:** Temperature and Respiratory Rate auto-filled with breed-specific numeric ranges since not provided. All 19 sections present. No markdown symbols. Plain text format.

Use bullet points (dash + space) for each section. NO other markdown symbols like ** or ##.

## Assessment and Differential Diagnoses

Summarize findings clearly:
- Key abnormalities
- System-based differentials (ranked by likelihood)
- Prognosis (Good, Fair, Guarded, Poor)

## Diagnostic Plan

(Only appears when Diagnostics are not yet provided and have not been explicitly declined.)

Include:
- Minimum Database (CBC, Chemistry, SDMA, Urinalysis)
- Imaging recommendations (radiographs, ultrasound)
- Targeted tests based on case type
- Monitoring parameters and rationale

If Diagnostics are already entered with the case, skip this step and proceed to the next section.

## Working Diagnosis and Treatment Plan

**⚠️ CRITICAL INSTRUCTION - READ CAREFULLY:**

**DO NOT GENERATE THIS SECTION** unless one of these conditions is met:

1. ✅ Diagnostic results ARE explicitly provided in the input (CBC values, chemistry values, imaging findings, lab numbers)
2. ✅ User explicitly states "skip diagnostics" or "proceed without diagnostics" or "owner declined diagnostics"
3. ✅ Summary + Diagnostics received together in same message

**IF NONE OF THESE CONDITIONS ARE MET:**
- **STOP IMMEDIATELY** after completing the "Diagnostic Plan" section
- **DO NOT** generate "Working Diagnosis and Treatment Plan"
- **DO NOT** generate treatment details, medications, or protocols
- **DO NOT** generate client discharge email
- **WAIT** for the user to provide diagnostic results in their next message

**CRITICAL CHECKPOINT:** If you see phrases like "Awaiting results", "pending", "recommend CBC", or "next steps include diagnostics" - that means diagnostics are NOT provided yet. Your response MUST END immediately after the Diagnostic Plan section. Do not output any text about stopping or waiting - simply end your response after the Diagnostic Plan.

Only continue generating the sections below if you have confirmed that actual diagnostic results (specific lab values, imaging findings, specific test numbers) are present in the user's current input.

### Diagnostic Assessment (comes first):
- CBC & Chemistry — detailed interpretation with values
- Urinalysis — relevant findings
- Blood Pressure — readings with interpretation
- Imaging — findings with modality
- Brief diagnostic conclusion

### Diagnosis:
- Primary diagnosis with staging/severity if applicable
- Secondary or contributing conditions

### TREATMENT PLAN

Provide a fully detailed, export-ready plan, with no placeholders or bracketed text.

#### 1. Hospitalization / Acute Management
- Fluid therapy: specify type, rate (mL/kg/hr), route, duration
- Pain control: drug, dosage, route, frequency, duration
- Antiemetics, gastroprotectants, antibiotics as indicated
- Nutrition: NPO vs. diet recommendations

#### 2. Long-Term Management
- Diet, supplements, phosphate/potassium/BP control as indicated
- Chronic medication details: name, dose (mg/kg + calculated), route, frequency, duration
- Home care instructions and tapering plans

#### 3. Monitoring Schedule
- Recheck timelines (1–2 week, monthly, etc.)
- BP, urine, chemistry monitoring frequency
- Clinical signs to monitor at home

#### 4. Client Education
- Explain disease course, what to expect, and when to return
- Include home monitoring instructions in the correct unit system (lb vs kg, °F vs °C)

#### 5. Optional / Adjunctive Therapies
- Supplements, home fluids, environmental management as appropriate

### Formatting

Use a numbered layout:
1. **Medications** (detailed with brand/generic, mg/kg, route, frequency, duration)
2. **Procedures/Topicals** (frequency and technique)
3. **Supportive/Preventive Care**
4. **Recheck Plan**
5. **Owner Instructions**

Example (for otitis externa):

**Medications:**
1. Maropitant (Cerenia) — 1 mg/kg SC q24h for 5 days (antiemetic).
2. Enrofloxacin (Baytril) otic drops — 5 drops per ear q12h for 10 days.

**Ear Cleaning:**
- Use 0.2% salicylic acid + EDTA solution q48h for 10 days, then weekly.
- Massage canal gently; discontinue if redness worsens.

**Follow-Up:**
- Recheck ear cytology in 14 days.
- Resume maintenance cleaning weekly after infection resolves.

## KEY RULES

- No summary table at the end.
- Unreported parameters = "Normal" (with numeric range if applicable).
- Diagnostic Assessment always precedes Treatment Plan.
- Sequential workflow enforced unless Summary + Diagnostics provided together.
- Units localized automatically to clinic country/IP region.
- All Treatment Plans must be detailed, contextual, and clinically accurate.
- Never require structured formatting; automatically parse free text or transcripts.
- Patient ID is optional.
- Do not ask for missing data if it's already implied in the text.
- Never reference AI, software, or internal logic.
- No emojis, dashes, or informal symbols.
- All content must be clinically accurate and suitable for medical records.
- Maintain consistent headings for export into EMRs.
- Always prioritize medical relevance and clarity.
- Follow the sequential workflow UNLESS diagnostics are already provided in the input (see INPUT ANALYSIS section above). If diagnostics are provided, skip directly to Working Diagnosis and Treatment Plan.
- **CRITICAL - LIABILITY PROTECTION**: NEVER use absolute language like "exact", "definitive", "certain", "guaranteed", "will cure", "always", or "never" when referring to diagnoses, causes, outcomes, or prognoses. Instead use qualified language like "possible", "potential", "likely", "underlying", "suspected", "consistent with", "may help", "aim to", etc. Example: Say "determine the possible cause" NOT "determine the exact cause". Say "this may help manage symptoms" NOT "this will cure the condition".

## Formatting Guidelines:
- Use markdown headers (##) for main sections
- Use bold (**text**) for field labels
- Use bullet points (-) for lists
- Add blank lines between sections for readability
- Keep formatting clean and UI-friendly
- Replace all instances of "Current" with actual date/time: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }

    // Add Pinecone context if available
    if (contextFromPinecone) {
      systemPrompt += `\n\nRelevant Knowledge Base Context:\n${contextFromPinecone}`;
    }

    // Get clinic information for email signatures
    const { data: clinicInfo } = await supabase
      .from('clinics')
      .select('name')
      .eq('id', profile.clinic_id)
      .single();

    const clinicName = clinicInfo?.name || '[Clinic Name]';
    const doctorName = (profile as any).name || '[Doctor Name]';

    // Add patient context if available
    if (patientContext) {
      let weightDisplay = 'Not recorded';
      if (patientContext.weightKg) {
        if (useBoth) {
          weightDisplay = `${patientContext.weightKg} kg (${patientContext.weightLb} lb)`;
        } else if (useMetric) {
          weightDisplay = `${patientContext.weightKg} kg`;
        } else {
          weightDisplay = `${patientContext.weightLb} lb`;
        }
      }
      
      systemPrompt += `

CURRENT VISIT INFORMATION:
- Patient: ${patientContext.name} (${patientContext.species}, ${patientContext.breed})
- Age: ${typeof patientContext.age === 'number' ? `${patientContext.age} years` : patientContext.age}
- Sex: ${patientContext.sex}
- Weight: ${weightDisplay}
- Presenting Complaint: ${patientContext.presentingComplaint || 'Not specified'}
${patientContext.alerts ? `- Alerts: ${patientContext.alerts}` : ''}`;

      systemPrompt += `

Email Signature Information (auto-populate in all client emails):
- Doctor Name: ${doctorName}
- Clinic Name: ${clinicName}`;

      if (patientContext.recentVisits && patientContext.recentVisits.length > 0) {
        systemPrompt += `\n\nPREVIOUS VISIT HISTORY (for context - DO NOT display in current conversation):`;
        patientContext.recentVisits.forEach((visit: any, index: number) => {
          systemPrompt += `\n${index + 1}. ${new Date(visit.date).toLocaleDateString()}
   - Chief Complaint: ${visit.complaint}
   - Assessment: ${visit.diagnosis}
   - Plan: ${visit.treatment}
   ${visit.weight ? `- Weight: ${visit.weight} kg` : ''}`;
        });
        systemPrompt += `\n\nIMPORTANT: This historical data is for your clinical reasoning ONLY.
- Use it to inform your assessment and recommendations
- DO NOT mention previous visits unless directly relevant to current complaint
- Focus responses on the CURRENT presenting complaint: "${patientContext.presentingComplaint || 'Not specified'}"
- Only reference history when clinically significant (e.g., "This is the third occurrence of vomiting in 2 months...")`;
      }

      systemPrompt += `\n\nMEDICATION DOSING REQUIREMENTS:
When prescribing medications:
${patientContext.weightKg ? `
1. Always use mg/kg dosing based on species-specific guidelines
2. Calculate exact dose using patient weight: ${patientContext.weightKg} kg
3. Show calculation format: "Carprofen (2 mg/kg PO BID) → ${(2 * patientContext.weightKg).toFixed(1)} mg per dose, give one 100mg tablet twice daily"
4. Round to appropriate tablet/capsule sizes or mL volumes
5. Include route (PO, SC, IM, IV), frequency, and duration
6. Note contraindications and monitoring requirements` : `
WARNING: Patient weight not recorded. Request weight before prescribing medications.
When weight is provided, calculate all doses using mg/kg based on species-specific guidelines.`}`;
    }

// Build messages array for AI
const imageAttachments = (attachments || []).filter(att => att.type?.startsWith('image/'));
const nonImageAttachments = (attachments || []).filter(att => !att.type?.startsWith('image/'));

// Add special instruction if multiple documents were uploaded
let baseText = (message && message.trim().length > 0)
  ? message.trim()
  : `Please analyze the attached diagnostic files.${nonImageAttachments.length ? ' Non-image documents: ' + nonImageAttachments.map(a => a.name).join(', ') : ''}`;

// If images are uploaded, specifically request diagnostic analysis
if (imageAttachments.length > 0) {
  const imageTypeHint = imageAttachments.map(a => a.name).join(', ');
  baseText = `[DIAGNOSTIC IMAGE(S) UPLOADED: ${imageTypeHint}]\n\nPlease analyze the diagnostic image(s) and provide:\n1. Imaging modality identification\n2. Systematic description of findings\n3. Clinical interpretation and differential diagnoses\n4. Recommended follow-up diagnostics\n5. Integration with the patient's clinical presentation\n\n${baseText}`;
}

// If multiple documents were uploaded in this message, add synthesis instruction
if (attachments && attachments.length > 1) {
  baseText = `[MULTIPLE DIAGNOSTIC DOCUMENTS UPLOADED - Please synthesize ALL findings together and proceed to Step 6]\n\n${baseText}`;
}

const userContent: any = imageAttachments.length > 0
  ? [
      { type: 'text', text: baseText },
      ...imageAttachments.map(att => ({
        type: 'image_url',
        image_url: { url: att.url }
      }))
    ]
  : baseText;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: userContent }
    ];

// Log sanitized message info (don't log full content)
console.log('[CLAUDE] Calling chat API - msgLen:', (message || '').length, 'images:', (imageAttachments || []).length, 'docs:', (nonImageAttachments || []).length, 'has patient context:', !!patientContext);

    // Build Claude messages (system prompt is separate in Claude API)
    // Handle images: Claude needs base64 or URL in content array
    let claudeUserContent: any = typeof userContent === 'string' 
      ? userContent 
      : userContent; // Already in correct format for images
    
    // If there are image attachments, construct Claude-compatible content
    if (imageAttachments.length > 0) {
      const textPart = typeof userContent === 'string' 
        ? userContent 
        : (userContent as any[]).find((p: any) => p.type === 'text')?.text || '';
      
      // Claude accepts image URLs directly in content array
      claudeUserContent = [
        { type: 'text', text: textPart },
        ...imageAttachments.map(att => ({
          type: 'image',
          source: {
            type: 'url',
            url: att.url,
          }
        }))
      ];
    }

    const claudeMessages = conversationHistory.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));
    claudeMessages.push({ role: 'user', content: claudeUserContent });

    // Call Gemini API
    let assistantMessage = '';
    try {
      const chatResult = await callGemini({
        system: systemPrompt,
        messages: claudeMessages,
        temperature: 0.3,
        maxTokens: 4000,
      });
      
      assistantMessage = chatResult.content;
      console.log('[CLAUDE] Response received, length:', assistantMessage.length);
    } catch (claudeErr) {
      console.error('[CLAUDE] API call failed:', claudeErr);
      throw new Error('AI generation failed');
    }

    if (!assistantMessage) {
      throw new Error('Empty AI response');
    }

    // SAFETY NET: Clean up formatting BEFORE validation
    let cleanedMessage = assistantMessage;
    
    // Remove any "SECTION X:" headers globally
    const beforeSectionCount = (cleanedMessage.match(/SECTION \d+:/gi) || []).length;
    cleanedMessage = cleanedMessage.replace(/^\s*SECTION\s+\d+:\s*/gmi, '');
    if (beforeSectionCount > 0) {
      console.log(`🧹 Safety net: Removed ${beforeSectionCount} "SECTION X:" headers`);
    }

    // Normalize section headers to bold if plain text on their own line
    const sectionHeaderPattern = /^(SUMMARY|VITALS|PHYSICAL EXAM|ASSESSMENT\s*&\s*DIFFERENTIALS|DIAGNOSTIC SUMMARY|FINAL ASSESSMENT|EUTHANASIA RECORD|CONCLUSION)\s*$/gim;
    cleanedMessage = cleanedMessage.replace(sectionHeaderPattern, (_m: string, p1: string) => `**${p1.toUpperCase()}**`);

    // Ensure vital labels are bold (regardless of inline/vertical)
    cleanedMessage = cleanedMessage
      .replace(/(\n|^)\s*Weight:\s*/gi, '$1**Weight:** ')
      .replace(/(\n|^)\s*Temperature:\s*/gi, '$1**Temperature:** ')
      .replace(/(\n|^)\s*Heart\s*Rate:\s*/gi, '$1**Heart Rate:** ')
      .replace(/(\n|^)\s*Respiratory\s*Rate:\s*/gi, '$1**Respiratory Rate:** ')
      .replace(/(\n|^)\s*Capillary\s*Refill\s*Time:\s*/gi, '$1**Capillary Refill Time:** ')
      .replace(/(\n|^)\s*Mucous\s*Membranes:\s*/gi, '$1**Mucous Membranes:** ')
      .replace(/(\n|^)\s*Dehydration:\s*/gi, '$1**Dehydration:** ')
      .replace(/(\n|^)\s*Attitude:\s*/gi, '$1**Attitude:** ');

    
    // Auto-verticalize vitals if they're inline
    const vitalsHeader = '**VITALS**';
    const vitalsStart = cleanedMessage.indexOf(vitalsHeader);
    if (vitalsStart !== -1) {
      const afterStart = vitalsStart + vitalsHeader.length;
      const nextHeaders = ['**PHYSICAL EXAM**','**ASSESSMENT','**DIAGNOSTIC SUMMARY**','**FINAL ASSESSMENT**','**EUTHANASIA RECORD**','**CONCLUSION**'];
      let nextIndex = cleanedMessage.length;
      for (const h of nextHeaders) {
        const idx = cleanedMessage.indexOf(h, afterStart);
        if (idx !== -1 && idx < nextIndex) nextIndex = idx;
      }
      const vitalsSection = cleanedMessage.slice(afterStart, nextIndex);
      let verticalizedVitals = vitalsSection;

      // Check if vitals are inline (multiple labels on same line)
      const hasInlineVitals = /Weight:.*Temperature:/i.test(vitalsSection) || /Temperature:.*Heart Rate:/i.test(vitalsSection);

      if (hasInlineVitals) {
        console.log('🧹 Safety net: Auto-verticalizing inline vitals');
        verticalizedVitals = vitalsSection
          .replace(/(\*\*Weight:\*\*[^\n]*?)\s+(\*\*Temperature:)/gi, '$1\n$2')
          .replace(/(\*\*Temperature:\*\*[^\n]*?)\s+(\*\*Heart Rate:)/gi, '$1\n$2')
          .replace(/(\*\*Heart Rate:\*\*[^\n]*?)\s+(\*\*Respiratory Rate:)/gi, '$1\n$2')
          .replace(/(\*\*Respiratory Rate:\*\*[^\n]*?)\s+(\*\*Capillary)/gi, '$1\n$2')
          .replace(/(\*\*Capillary[^:]*:\*\*[^\n]*?)\s+(\*\*Mucous)/gi, '$1\n$2')
          .replace(/(\*\*Mucous[^:]*:\*\*[^\n]*?)\s+(\*\*Dehydration:)/gi, '$1\n$2')
          .replace(/(\*\*Dehydration:\*\*[^\n]*?)\s+(\*\*Attitude:)/gi, '$1\n$2')
          // Handle non-bold versions too
          .replace(/(Weight:[^\n]*?)\s+(Temperature:)/gi, '$1\n$2')
          .replace(/(Temperature:[^\n]*?)\s+(Heart Rate:)/gi, '$1\n$2')
          .replace(/(Heart Rate:[^\n]*?)\s+(Respiratory Rate:)/gi, '$1\n$2')
          .replace(/(Respiratory Rate:[^\n]*?)\s+(Capillary)/gi, '$1\n$2')
          .replace(/(Capillary[^:]*:[^\n]*?)\s+(Mucous)/gi, '$1\n$2')
          .replace(/(Mucous[^:]*:[^\n]*?)\s+(Dehydration:)/gi, '$1\n$2')
          .replace(/(Dehydration:[^\n]*?)\s+(Attitude:)/gi, '$1\n$2');
      }

      // Reassemble cleaned message with updated vitals section
      cleanedMessage = cleanedMessage.slice(0, afterStart) + verticalizedVitals + cleanedMessage.slice(nextIndex);
    }

      // VALIDATION: Now validate the CLEANED message for euthanasia cases
      // Check if this looks like euthanasia based on generated content OR detection
      const looksLikeEuthanasia = /EUTHANASIA RECORD/i.test(cleanedMessage);
      
      if ((isEuthanasiaDetected || looksLikeEuthanasia) && effectiveVisitType === 'procedure') {
        console.log('🔍 Running euthanasia validation on cleaned message (detected:', isEuthanasiaDetected, 'found in output:', looksLikeEuthanasia, ')');
        
        const validation = validateEuthanasiaDocument(cleanedMessage);
        const contentLower = cleanedMessage.toLowerCase();
        
console.log('🔍 Euthanasia case validation:', validation);

// Collect warnings instead of failing hard
let euthWarnings: string[] = [];

// Check for format errors on CLEANED message
const formatErrors = [];
        
        // Check 1: No "SECTION X:" labels should appear (after cleanup)
        if (cleanedMessage.match(/SECTION \d+:/i)) {
          formatErrors.push('Contains "SECTION X:" labels (should only be section names)');
        }
        
        // Check 2: Must have bold section headers
        if (!cleanedMessage.includes('**SUMMARY**') || 
            !cleanedMessage.includes('**VITALS**') ||
            !cleanedMessage.includes('**PHYSICAL EXAM**')) {
          formatErrors.push('Missing bold section headers (must use **SECTION NAME**)');
        }
        
        // Check 3: Vitals must be on separate lines (after verticalization)
        const vitalsHeader = '**VITALS**';
        const vitalsStart2 = cleanedMessage.indexOf(vitalsHeader);
        let vitalsSection2 = '';
        if (vitalsStart2 !== -1) {
          const afterStart2 = vitalsStart2 + vitalsHeader.length;
          const nextHeaders2 = ['**PHYSICAL EXAM**','**ASSESSMENT','**DIAGNOSTIC SUMMARY**','**FINAL ASSESSMENT**','**EUTHANASIA RECORD**','**CONCLUSION**'];
          let nextIndex2 = cleanedMessage.length;
          for (const h of nextHeaders2) {
            const idx2 = cleanedMessage.indexOf(h, afterStart2);
            if (idx2 !== -1 && idx2 < nextIndex2) nextIndex2 = idx2;
          }
          vitalsSection2 = cleanedMessage.slice(afterStart2, nextIndex2);
        }
        const vitalsLines = vitalsSection2.split('\n').map(l => l.trim()).filter(Boolean);
        if (vitalsLines.length < 6) {
          formatErrors.push('Vitals must be formatted vertically (each vital on separate line)');
        }
        
        // Check 4: Physical exam must be comprehensive
        const physExamSection = cleanedMessage.match(/\*\*PHYSICAL EXAM\*\*([\s\S]*?)(?=\*\*ASSESSMENT|$)/i)?.[1] || '';
        const hasComprehensivePE = physExamSection.includes('**Integument:**') &&
                                   physExamSection.includes('**EENT:**') &&
                                   physExamSection.includes('**Cardiovascular:**') &&
                                   physExamSection.includes('**Respiratory:**') &&
                                   physExamSection.includes('**Gastrointestinal');
        if (!hasComprehensivePE) {
          formatErrors.push('Physical exam must be comprehensive with all body systems');
        }
        
if (formatErrors.length > 0) {
  console.error('❌ Euthanasia format validation failed after cleanup:', {
    formatErrors,
    consultId: actualConsultId
  });
  euthWarnings.push(`Format issues detected: ${formatErrors.join('; ')}`);
}
      
      // Check for 8-section structure and forbidden sections (use cleanedMessage)
      const hasEuthanasiaRecord = cleanedMessage.includes('EUTHANASIA RECORD');
      
      // Define forbidden sections that should not appear in euthanasia records
      const forbiddenSections = [
        'diagnostic plan',
        'monitoring parameters',
        'recommended diagnostics',
        'follow-up instructions',
        'treatment plan',
        'minimum database'
      ];
      
      const foundForbiddenSections = forbiddenSections.filter(section => 
        contentLower.includes(section)
      );
      
if (foundForbiddenSections.length > 0) {
  console.error('❌ Euthanasia validation failed - forbidden sections found:', {
    foundSections: foundForbiddenSections,
    consultId: actualConsultId
  });
  euthWarnings.push(`Contains forbidden sections: ${foundForbiddenSections.join(', ')}`);
}
      
if (!validation.isValid || !hasEuthanasiaRecord) {
  console.error('❌ Euthanasia validation failed:', {
    missingElements: validation.missingElements,
    hasDrugDetails: validation.hasDrugDetails,
    hasConfirmation: validation.hasConfirmation,
    hasClosure: validation.hasClosure,
    hasEuthanasiaRecord,
    consultId: actualConsultId
  });
  if (!hasEuthanasiaRecord) {
    euthWarnings.push('Missing "EUTHANASIA RECORD" section header');
  }
  if (!validation.isValid) {
    euthWarnings.push(`Missing required elements: ${validation.missingElements.join(', ')}`);
  }
}

// Log warnings for debugging but do not add them to output
if (euthWarnings.length > 0) {
  console.log('⚠️ Euthanasia validation warnings (not shown to user):', euthWarnings.join('; '));
}
}

    // Post-processing filter: Strip treatment sections if diagnostics not provided
    // This is a safety measure to prevent AI from generating premature treatment plans
    const hasDiagnostics = /\b(WBC|HCT|PCV|BUN|creatinine|ALT|AST|ALP|GGT|total protein|albumin|glucose|radiograph|ultrasound|x-ray|CBC shows|chemistry reveals|lab results|diagnostic findings|imaging shows)\b/i.test(trimmedMessage);
    
    if (!hasDiagnostics && !trimmedMessage.toLowerCase().includes('declined') && !trimmedMessage.toLowerCase().includes('skip diagnostic')) {
      // Check if AI generated treatment sections prematurely
      const treatmentSectionIndex = cleanedMessage.indexOf('## Working Diagnosis and Treatment Plan');
      
      if (treatmentSectionIndex !== -1) {
        console.log('⚠️ Post-processing: Stripping premature treatment plan - no diagnostics detected in input');
        // Remove everything after "Diagnostic Plan" section
        cleanedMessage = cleanedMessage.substring(0, treatmentSectionIndex).trim();
        console.log('Filtered response length:', cleanedMessage.length);
      }
    }

    // Store assistant response with cleaned formatting
    await supabase.from('chat_messages').insert({
      clinic_id: profile.clinic_id,
      user_id: user.id,
      consult_id: actualConsultId || null,
      role: 'assistant',
      content: cleanedMessage,
      sender_name: 'GrowDVM AI',
    });

    // Extract procedure details if this is a procedure consult (use cleanedMessage)
    if (actualConsultId && visitType === 'procedure') {
      try {
        // Extract procedure name and indication from the response
        // Handle markdown list formatting with leading dashes
        const procedureNameMatch = cleanedMessage.match(/[-\s]*\*\*Procedure\s+[Nn]ame\s+and\s+[Ii]ndication\*\*:\s*(.+?)(?:\n|$)/i);
        const procedureNameAndIndication = procedureNameMatch ? procedureNameMatch[1].trim() : null;
        
        let procedureName = null;
        let procedureIndication = null;
        
        if (procedureNameAndIndication) {
          // Try to split name and indication if they're combined with common delimiters
          const parts = procedureNameAndIndication.split(/(?:\s+due to\s+|\s+for\s+|\s+-\s+)/i);
          if (parts.length >= 2) {
            procedureName = parts[0].trim();
            procedureIndication = parts.slice(1).join(' - ').trim();
          } else {
            procedureName = procedureNameAndIndication;
          }
        }
        
        // Extract date and time - look for "Date and Time of Procedure:"
        // Handle markdown list formatting with leading dashes
        const dateTimeMatch = cleanedMessage.match(/[-\s]*\*\*Date\s+and\s+Time\s+of\s+Procedure\*\*:\s*(.+?)(?:\n|$)/i);
        let procedureDateTime = null;
        
        if (dateTimeMatch) {
          try {
            // Try to parse the extracted date/time string
            const dateStr = dateTimeMatch[1].trim();
            procedureDateTime = new Date(dateStr).toISOString();
          } catch {
            // If parsing fails, use current time
            procedureDateTime = new Date().toISOString();
          }
        } else {
          // Default to current time if not found
          procedureDateTime = new Date().toISOString();
        }
        
        // Update consult with extracted procedure details
        const updateData: any = {};
        if (procedureName) updateData.procedure_name = procedureName;
        if (procedureIndication) updateData.procedure_indication = procedureIndication;
        if (procedureDateTime) updateData.procedure_date_time = procedureDateTime;
        
        if (Object.keys(updateData).length > 0) {
          await supabase
            .from('consults')
            .update(updateData)
            .eq('id', actualConsultId);
          
          console.log('Extracted procedure details:', updateData);
        }
      } catch (error) {
        console.error('Error extracting procedure details:', error);
        // Non-fatal, continue
      }
    }

    // REGENERATION: Mark as ready if this was a pending regeneration
    if (actualConsultId) {
      const { data: consultData } = await supabase
        .from('consults')
        .select('regen_status, version, timeline')
        .eq('id', actualConsultId)
        .single();

      if (consultData?.regen_status === 'pending') {
        // Add regeneration complete event to timeline
        const currentTimeline = (consultData.timeline as any) || [];
        const regenEvent = {
          event: 'regen',
          artifact: 'SOAP',
          version: consultData.version || 1,
          at: new Date().toISOString(),
        };

        await supabase
          .from('consults')
          .update({
            regen_status: 'ready',
            timeline: [...currentTimeline, regenEvent],
          })
          .eq('id', actualConsultId);

        console.log(`Regeneration complete for consult ${actualConsultId} v${consultData.version}`);
      }
    }

    // SOAP extraction removed - new workflow doesn't use SOAP notes

    // Extract and update reason for visit if diagnosis/assessment is provided
    if (actualConsultId) {
      try {
        // Check if reason_for_visit is already set
        const { data: existingConsult } = await supabase
          .from('consults')
          .select('reason_for_visit')
          .eq('id', consultId)
          .single();

        // Only generate if not already set and message contains clinical content
        const hasClinicalContent = cleanedMessage.includes('Initial Differentials') || 
                                   cleanedMessage.includes('Clinical Summary') ||
                                   cleanedMessage.includes('Assessment') ||
                                   cleanedMessage.length > 200;

        if (!existingConsult?.reason_for_visit && hasClinicalContent) {
          // Ask AI to generate a concise reason for visit
          const summaryResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: 'You are a medical record assistant. Generate a brief (3-7 words) reason for visit based on the clinical assessment. Examples: "Vomiting and diarrhea", "Laceration to left forelimb", "Cough and respiratory distress". Keep it concise and clinical. Return ONLY the reason, no quotes or extra text.'
                },
                {
                  role: 'user',
                  content: `Based on this clinical note, provide a brief reason for visit:\n\n${assistantMessage}`
                }
              ],
              temperature: 0.3,
            }),
          });

          if (summaryResponse.ok) {
            const summaryData = await summaryResponse.json();
            const reasonForVisit = summaryData.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
            
            console.log('Generated reason for visit:', reasonForVisit);
            
          // Update the consult with the reason
          await supabase
            .from('consults')
            .update({ reason_for_visit: reasonForVisit })
            .eq('id', actualConsultId);
          }
        }
      } catch (error) {
        console.error('Error generating reason for visit:', error);
      }
    }

    // Log to audit
    await supabase.from('audit_events').insert({
      clinic_id: profile.clinic_id,
      user_id: user.id,
      action: 'ai_chat',
      entity_type: 'chat',
      details: { message_length: message.length },
    });

    return new Response(
      JSON.stringify({ 
        message: cleanedMessage,
        consultId: actualConsultId || null
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[CHAT-ASSISTANT] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'An error occurred processing your message',
        code: 'CHAT_ERROR'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
