import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[MEDICATION-PROFILE] ${step}${detailsStr}`);
};

interface MedicationProfileRequest {
  drugName: string;
  patientInfo?: {
    species?: string;
    breed?: string;
  };
}

interface MedicationProfile {
  drugName: string;
  brandNames: string;
  description: string;
  uses: string;
  durationOfTherapy: string;
  durationOfEffects: string;
  commonSideEffects: string;
  severeSideEffects: string;
  animalWarnings: string;
  storageDirections: string;
  disposal: string;
  missedDoseProtocol: string;
  overdose: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");
    
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }
    logStep("User authenticated", { userId: user.id });

    // Parse request body
    const { drugName, patientInfo }: MedicationProfileRequest = await req.json();
    
    if (!drugName || typeof drugName !== 'string' || drugName.trim().length === 0) {
      throw new Error('Drug name is required');
    }
    logStep("Request parsed", { drugName, patientInfo });

    // Normalize drug name for cache lookup
    const drugNameNormalized = drugName.trim().toLowerCase();
    
    // Create service role client for cache operations (bypasses RLS)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check cache first
    logStep("Checking cache", { drugNameNormalized });
    const { data: cached, error: cacheError } = await serviceClient
      .from('medication_profile_cache')
      .select('profile_json, expires_at')
      .eq('drug_name_normalized', drugNameNormalized)
      .maybeSingle();

    if (cacheError) {
      logStep("Cache lookup error (non-fatal)", { error: cacheError.message });
    }

    // If valid cache exists, return it immediately
    if (cached && new Date(cached.expires_at) > new Date()) {
      logStep("Cache HIT - returning cached profile", { drugName, expiresAt: cached.expires_at });
      return new Response(
        JSON.stringify({ 
          success: true, 
          profile: cached.profile_json,
          requestedDrug: drugName,
          cached: true
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    logStep(cached ? "Cache EXPIRED - regenerating" : "Cache MISS - generating new profile");

    // Build the system prompt - pet-owner friendly language
    const systemPrompt = `You are a friendly veterinary pharmacist helping pet owners understand their pet's medication. Generate a CLEAR, EASY-TO-UNDERSTAND medication guide for the specified drug.

Core Requirements:
- Language: Use simple, everyday words. Avoid medical jargon. Write as if explaining to a caring pet parent with no medical background.
- Tone: Warm, reassuring, and helpful - like a kind vet explaining things in person.
- Accuracy: All information must be medically accurate as of 2026, but explained simply.
- If information is not available or varies significantly, say "Please ask your vet about this" rather than using complex medical language.
- Detail Level: Be thorough but keep explanations simple and practical.
- Bullet Points: Use "• " for lists to make scanning easy.

${patientInfo?.species ? `Note: This medication is for a ${patientInfo.species}${patientInfo.breed ? ` (${patientInfo.breed})` : ''}. Include any helpful tips specific to this type of pet.` : ''}

Respond with a valid JSON object (no markdown, no code blocks) with these fields:
{
  "drugName": "Medication name (with common brand names you might see on the label)",
  "brandNames": "Other names this medication might be sold under",
  "description": "What is this medication and how does it help your pet? Explain in 2-3 simple sentences what this medicine does in your pet's body.",
  "uses": "What conditions does this medication treat? List the common reasons vets prescribe this:\\n• Condition 1 - brief explanation of how it helps\\n• Condition 2 - brief explanation of how it helps",
  "durationOfTherapy": "How long will my pet need to take this? Give typical timeframes and explain that your vet will advise the exact duration based on your pet's needs.",
  "durationOfEffects": "How quickly does it start working and how long does each dose last? Explain in simple terms when you might notice improvement.",
  "commonSideEffects": "Mild side effects that some pets experience (usually not serious):\\n• What to watch for and what's normal\\n• These often pass as your pet adjusts to the medication",
  "severeSideEffects": "Stop the medication and call your vet right away if you notice:\\n• Serious warning sign 1 - what it looks like\\n• Serious warning sign 2 - what it looks like",
  "animalWarnings": "Important safety information for your pet:\\n• Which pets should NOT take this medication\\n• Health conditions that need extra caution\\n• Other medications that don't mix well with this one",
  "storageDirections": "How to store this medication properly to keep it working well. Include where to keep it and what to avoid (heat, light, moisture).",
  "disposal": "How to safely get rid of unused medication when you're done. Simple step-by-step instructions.",
  "missedDoseProtocol": "What to do if you forget a dose: Clear, simple instructions. When to give it late, when to skip to the next dose, and what NOT to do (like giving double doses).",
  "overdose": "Signs your pet may have gotten too much medication and what to do:\\n• Warning signs to watch for\\n• Steps to take right away\\n• When to call your vet or emergency clinic"
}`;

    const userPrompt = `Generate a detailed medication profile for: ${drugName.trim()}`;

    logStep("Calling Lovable AI Gateway");

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const aiResponse = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 4096,
        temperature: 0.3,
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      logStep("[LOVABLE-AI] Gateway error", { status: aiResponse.status, error: errorText });
      
      if (aiResponse.status === 429) {
        throw new Error('Rate limits exceeded, please try again later.');
      }
      if (aiResponse.status === 402) {
        throw new Error('Payment required, please add funds to your Lovable AI workspace.');
      }
      
      throw new Error(`Lovable AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    logStep("AI response received", { contentLength: content.length });

    // Parse the JSON response
    let profile: MedicationProfile;
    try {
      // Clean up the response - remove markdown code blocks if present
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.slice(7);
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith('```')) {
        cleanContent = cleanContent.slice(0, -3);
      }
      cleanContent = cleanContent.trim();
      
      profile = JSON.parse(cleanContent);
    } catch (parseError) {
      logStep("Failed to parse AI response as JSON", { error: String(parseError), content: content.substring(0, 500) });
      throw new Error('Failed to parse medication profile from AI response');
    }

    // Validate required fields exist
    const requiredFields = [
      'drugName', 'description', 'uses', 'durationOfTherapy', 
      'commonSideEffects', 'severeSideEffects', 'animalWarnings',
      'storageDirections', 'disposal', 'missedDoseProtocol', 'overdose'
    ];
    
    for (const field of requiredFields) {
      if (!profile[field as keyof MedicationProfile]) {
        profile[field as keyof MedicationProfile] = 'Information not available';
      }
    }

    logStep("Profile generated successfully", { drugName: profile.drugName });

    // Save to cache (upsert) - 6 months expiry
    const sixMonthsFromNow = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    
    const { error: upsertError } = await serviceClient
      .from('medication_profile_cache')
      .upsert({
        drug_name_normalized: drugNameNormalized,
        drug_name_display: drugName.trim(),
        profile_json: profile,
        updated_at: new Date().toISOString(),
        expires_at: sixMonthsFromNow
      }, {
        onConflict: 'drug_name_normalized'
      });

    if (upsertError) {
      logStep("Cache save error (non-fatal)", { error: upsertError.message });
    } else {
      logStep("Profile cached successfully", { expiresAt: sixMonthsFromNow });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        profile,
        requestedDrug: drugName,
        cached: false
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logStep("ERROR", { message });
    
    return new Response(
      JSON.stringify({ error: message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 
      }
    );
  }
});
