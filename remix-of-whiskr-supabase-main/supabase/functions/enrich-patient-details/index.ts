import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const systemPrompt = `You are a veterinary clinical assistant specializing in extracting patient demographic information from clinical consultation data.

Your task is to analyze transcriptions, case notes, and clinical records to extract the following patient information:
- Patient name (the actual pet name, NOT "New Patient", "Unknown", or generic placeholders)
- Species (standardize to: Canine, Feline, Avian, Lagomorph, Equine, Bovine, Porcine, Ovine, Caprine, or the specific species name)
- Breed (e.g., Bulldog, French Bulldog, Labrador Retriever, Domestic Shorthair, Persian, etc.)
- Sex (standardize to: Male, Female, Male (Neutered), Female (Spayed), Intact Male, Intact Female)
- Age (e.g., "7 years", "6 months", "2 years 3 months")
- Weight in kilograms (numeric value only)

Important guidelines:
- Only extract information that is explicitly mentioned or clearly implied in the clinical data
- For breed, be specific (e.g., "French Bulldog" not just "Bulldog" if specified)
- For sex, include neutered/spayed status if mentioned (e.g., "spayed female dog" → "Female (Spayed)")
- Convert weight to kg if given in pounds (1 lb = 0.453592 kg)
- If information is not found or uncertain, do not include it in the response
- Look for patterns like "7 yo", "7 year old", "DOB", etc. for age
- Look for abbreviations like FS (Female Spayed), MN (Male Neutered), M (Male), F (Female)`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { patientId } = await req.json();
    
    if (!patientId) {
      return new Response(JSON.stringify({ error: 'Patient ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch current patient data
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .single();

    if (patientError || !patient) {
      return new Response(JSON.stringify({ error: 'Patient not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Early exit if patient details are already complete (saves AI credits)
    const isPatientComplete = (): boolean => {
      const nameFilled = patient.name && 
        !['new patient', 'unknown', 'patient', ''].includes((patient.name || '').toLowerCase().trim());
      const speciesFilled = patient.species && 
        !['unknown', ''].includes((patient.species || '').toLowerCase().trim());
      const breedFilled = patient.breed && (patient.breed || '').trim() !== '';
      const sexFilled = patient.sex && (patient.sex || '').trim() !== '';
      
      return nameFilled && speciesFilled && breedFilled && sexFilled;
    };

    if (isPatientComplete()) {
      console.log('Patient details already complete, skipping AI enrichment');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Patient details already complete',
        updatedFields: [],
        skipped: true
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all consults for this patient
    const { data: consults, error: consultsError } = await supabase
      .from('consults')
      .select('case_notes, soap_s, soap_o, soap_a, soap_p, reason_for_visit, history_summary')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (consultsError) {
      console.error('Error fetching consults:', consultsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch consults' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!consults || consults.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'No consultation data found for this patient' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build context from all consult data
    const contextParts: string[] = [];
    
    consults.forEach((consult, index) => {
      let consultText = `--- Consultation ${index + 1} ---\n`;
      
      if (consult.history_summary) {
        consultText += `History Summary:\n${consult.history_summary}\n\n`;
      }
      
      if (consult.reason_for_visit) {
        consultText += `Reason for Visit: ${consult.reason_for_visit}\n`;
      }
      
      if (consult.soap_s) {
        consultText += `Subjective: ${consult.soap_s}\n`;
      }
      
      if (consult.soap_o) {
        consultText += `Objective: ${consult.soap_o}\n`;
      }
      
      if (consult.case_notes) {
        try {
          const parsed = typeof consult.case_notes === 'string' 
            ? JSON.parse(consult.case_notes) 
            : consult.case_notes;
          
          if (parsed?.procedure?.procedureSummary) {
            consultText += `Procedure Summary: ${parsed.procedure.procedureSummary}\n`;
          }
          if (parsed?.procedure?.patientInfo) {
            consultText += `Patient Info from Procedure: ${parsed.procedure.patientInfo}\n`;
          }
        } catch {
          // If not JSON, use as-is
          consultText += `Case Notes: ${consult.case_notes}\n`;
        }
      }
      
      if (consultText.length > 30) { // Only add if there's meaningful content
        contextParts.push(consultText);
      }
    });

    const combinedContext = contextParts.join('\n');
    
    if (!combinedContext.trim()) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'No usable clinical data found in consultations' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Enriching patient details with AI. Context length:', combinedContext.length);

    // Call Lovable AI Gateway with function calling for structured output
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const tools = [{
      type: 'function',
      function: {
        name: "update_patient_details",
        description: "Update patient demographic information extracted from clinical data",
        parameters: {
          type: "object",
          properties: {
            name: { 
              type: "string",
              description: "The pet's actual name (not 'New Patient' or similar placeholders)"
            },
            species: { 
              type: "string",
              description: "Standardized species name (e.g., Canine, Feline, Avian)"
            },
            breed: { 
              type: "string",
              description: "Specific breed name"
            },
            sex: { 
              type: "string",
              description: "Sex with neutered/spayed status if known (e.g., 'Female (Spayed)', 'Male (Neutered)')"
            },
            age: { 
              type: "string",
              description: "Age in human-readable format (e.g., '7 years', '6 months')"
            },
            weight_kg: { 
              type: "number",
              description: "Weight in kilograms"
            }
          },
          required: []
        }
      }
    }];

    const userPrompt = `Analyze the following clinical consultation data and extract patient demographic information.

Current known patient data:
- Name: ${patient.name}
- Species: ${patient.species}
- Breed: ${patient.breed || 'Unknown'}
- Sex: ${patient.sex || 'Unknown'}
- Age: ${patient.age || 'Unknown'}
- Weight: ${patient.weight_kg ? patient.weight_kg + ' kg' : 'Unknown'}

Clinical Data to Analyze:
${combinedContext}

Extract any patient demographic information you can find. Only include fields where you found clear evidence in the clinical data.`;

    console.log('[LOVABLE-AI] Enriching patient details');
    const response = await fetch(LOVABLE_AI_URL, {
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
        tools,
        tool_choice: { type: 'function', function: { name: 'update_patient_details' } },
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[LOVABLE-AI] Gateway error:', response.status, errorText);
      
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
      
      throw new Error(`Lovable AI Gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    console.log('[LOVABLE-AI] Response received');

    // Extract the function call arguments (OpenAI format)
    const choice = aiResponse.choices?.[0];
    const toolCall = choice?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== 'update_patient_details') {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'AI could not extract patient details from the available data' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let extracted: Record<string, any> = {};
    try {
      extracted = JSON.parse(toolCall.function.arguments || '{}');
    } catch {
      extracted = {};
    }
    console.log('Extracted patient data:', extracted);

    // Build update object - only update fields that are currently unknown/empty and have new values
    const updateData: Record<string, any> = {};
    const updatedFields: string[] = [];

    // Only update name if it's "New Patient" or similar and we found a real name
    const isPlaceholderName = ['new patient', 'unknown', 'patient'].includes(patient.name?.toLowerCase() || '');
    if (extracted.name && isPlaceholderName && !['new patient', 'unknown'].includes(extracted.name.toLowerCase())) {
      updateData.name = extracted.name;
      updatedFields.push('name');
    }

    // Update species if currently "Unknown" and we found a value
    if (extracted.species && (patient.species?.toLowerCase() === 'unknown' || !patient.species)) {
      updateData.species = extracted.species;
      updatedFields.push('species');
    }

    // Update breed if empty and we found a value
    if (extracted.breed && !patient.breed) {
      updateData.breed = extracted.breed;
      updatedFields.push('breed');
    }

    // Update sex if empty and we found a value
    if (extracted.sex && !patient.sex) {
      updateData.sex = extracted.sex;
      updatedFields.push('sex');
    }

    // Update age if empty and we found a value
    if (extracted.age && !patient.age && !patient.date_of_birth) {
      updateData.age = extracted.age;
      updatedFields.push('age');
    }

    // Update weight if empty and we found a value
    if (extracted.weight_kg && !patient.weight_kg) {
      updateData.weight_kg = extracted.weight_kg;
      updateData.weight_lb = parseFloat((extracted.weight_kg * 2.20462).toFixed(2));
      updatedFields.push('weight');
    }

    if (Object.keys(updateData).length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No new information found to update',
        updatedFields: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update the patient record
    const { error: updateError } = await supabase
      .from('patients')
      .update(updateData)
      .eq('id', patientId);

    if (updateError) {
      console.error('Error updating patient:', updateError);
      throw new Error('Failed to update patient record');
    }

    console.log('Successfully updated patient with fields:', updatedFields);

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Updated: ${updatedFields.join(', ')}`,
      updatedFields,
      updatedData: updateData
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in enrich-patient-details:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
