import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callGemini, GEMINI_MODEL } from '../_shared/geminiClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PATIENT_EXTRACTION_PROMPT = `You are a veterinary clinical assistant. Extract patient demographic information from this voice transcription of a veterinary consultation.

Return ONLY valid JSON matching this exact schema:
{
  "patient": {
    "name": "Pet name if mentioned (e.g., 'Max', 'Bella' - NOT generic terms like 'dog' or 'patient')",
    "species": "Canine/Feline/Avian/Rabbit/Equine/Reptile/Other or null if not mentioned",
    "breed": "Breed if mentioned (e.g., 'Labrador', 'Domestic Shorthair') or null",
    "sex": "Male/Female/Male (Neutered)/Female (Spayed)/Male (Intact)/Female (Intact) or null",
    "age": "Age in readable format (e.g., '4 years', '6 months', '8 weeks') or null",
    "weight": {"value": null, "unit": null}
  },
  "confidence": 0.0
}

EXTRACTION RULES:
1. Only extract information EXPLICITLY stated in the transcription
2. Do NOT guess or infer missing data - leave fields null if not clearly mentioned
3. Look for common patterns:
   - "This is Max, a 4-year-old neutered male Labrador"
   - "On exam, Luna is..."
   - "Patient is a 2-year-old female cat"
   - "Fluffy is an 8-month-old intact male Pomeranian"
   - "Brought in today is Bella, a spayed female domestic shorthair"
4. Extract weight if mentioned (e.g., "weighing 30 kg", "at 65 pounds", "weight is 12.5 kilograms")
5. For weight.unit, use "kg" or "lb" (lowercase)
6. Set confidence 0.0-1.0 based on how clearly the information was stated:
   - 0.9-1.0: Clear, explicit mentions (e.g., "This is Max, a 4-year-old male Lab")
   - 0.7-0.8: Reasonable clarity but some inference needed
   - 0.5-0.6: Partial information or unclear context
   - Below 0.5: Very uncertain or ambiguous

IMPORTANT:
- Names like "New Patient" or generic terms are NOT valid patient names
- If you cannot confidently extract a name, leave it null
- Species should be standardized: Canine (not dog), Feline (not cat), etc.
- Sex should include neuter status if mentioned`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcription } = await req.json();

    if (!transcription || typeof transcription !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Transcription text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Skip very short transcriptions
    if (transcription.trim().length < 20) {
      return new Response(
        JSON.stringify({ 
          patient: null, 
          confidence: 0,
          reason: 'Transcription too short for reliable extraction'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use first 3000 characters of transcription (patient info is usually at the beginning)
    const truncatedTranscription = transcription.slice(0, 3000);

    console.log('[GEMINI-3-FLASH] Extracting patient from transcription');
    
    const aiResult = await callGemini({
      system: PATIENT_EXTRACTION_PROMPT,
      messages: [{ role: 'user', content: `Extract patient information from this veterinary consultation transcription:\n\n${truncatedTranscription}` }],
      maxTokens: 1024,
      temperature: 0.1, // Low temperature for consistent extraction
      model: GEMINI_MODEL,
    });

    const content = aiResult.content;

    if (!content) {
      throw new Error('No content in AI response');
    }
    
    console.log('[GEMINI-3-FLASH] Patient extraction completed');

    // Parse JSON from response (handle potential markdown code blocks)
    let parsed;
    try {
      // Remove markdown code blocks if present
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      return new Response(
        JSON.stringify({ 
          patient: null, 
          confidence: 0,
          reason: 'Failed to parse AI response'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate and sanitize the response
    const result = {
      patient: parsed.patient || null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    };

    // Additional validation: reject invalid names
    if (result.patient?.name) {
      const invalidNames = ['new patient', 'unknown', 'patient', 'dog', 'cat', 'pet'];
      if (invalidNames.includes(result.patient.name.toLowerCase())) {
        result.patient.name = null;
      }
    }

    console.log('Patient extraction result:', JSON.stringify(result));

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in extract-patient-from-transcription:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        patient: null,
        confidence: 0
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
