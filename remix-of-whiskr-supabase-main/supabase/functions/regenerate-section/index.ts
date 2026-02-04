import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withAIRateLimit } from '../_shared/aiRateLimiter.ts';
import { callGemini, GEMINI_MODEL } from '../_shared/geminiClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Section-specific formatting rules for each report type
const sectionFormatRules: Record<string, Record<string, string>> = {
  procedure: {
    'Procedure Summary': 'Brief paragraph format (1-2 sentences summarizing the procedure).',
    'Pre-Procedure Assessment': `Use bullet points (•) for each finding:
• Physical exam findings (TPR, BCS, MM, CRT)
• Lab work reviewed
• ASA status
• NPO status
• IV catheter details`,
    'Anesthetic Protocol': `Use bullet points (•) with sub-items (-) for each phase:
• Premedication: [details]
• Induction: [details]
• Maintenance: [details]
• Monitoring parameters: [details]`,
    'Procedure Details': 'Use bullet points (•) for each procedural step performed.',
    'Medications Administered': `Use bullet points (•) organized by:
• In-hospital medications
• Take-home medications`,
    'Post-Procedure Status': 'Use bullet points (•) for recovery findings.',
    'Follow-Up Instructions': 'Use bullet points (•) for each home care instruction.',
    'Client Communication': 'Brief paragraph format summarizing owner discussion.',
    'Email to Client': 'Professional email format with greeting, body paragraphs, and sign-off.'
  },
  soap: {
    'Subjective': 'Use bullet points (•) for presenting complaint, history, and owner observations.',
    'Objective': `Use headings with bullet points:

Vitals:
• Each vital on its own bullet point

Physical Examination:
• Each body system on its own bullet point

Diagnostic Findings: (ONLY if diagnostics were provided)
• Simple bullet-point summaries of key clinical findings
• Focus on clinical significance, not raw lab values
• Highlight abnormal findings with [[brackets]]
• Example: "Bloodwork indicates [[hepatobiliary disease]] with elevated liver enzymes"
Note: Skip this section entirely if no diagnostics were mentioned`,
    'Assessment': `Use bullet points (•) organized by:
• Primary/Working Diagnosis: Most likely diagnosis with brief clinical rationale
  - Include key findings supporting this diagnosis
• Differential Diagnoses: Other conditions being considered
  - Include brief reasoning for each differential
  - Order by likelihood
• Clinical Reasoning: Key findings supporting the diagnosis
  - Connect clinical signs to pathophysiology
• Rule-outs: Conditions considered but ruled out based on findings
  - Include brief reasoning for exclusion`,
    'Plan': 'Use bullet points (•) for each treatment item, diagnostic, and medication.'
  },
  wellness: {
    'Patient Information': `Use bullet points (•) for each data element:
• Patient Name:
• Species:
• Breed:
• Age:
• Weight:
• Owner:`,
    'Vitals & Weight Management': `Use bullet points (•) for each vital sign:
• Weight:
• Body Condition Score:
• Temperature:
• Heart Rate:
• Respiratory Rate:`,
    'Physical Examination': 'Use bullet points (•) for each body system - ALL 17 systems must be included.',
    'Assessment': 'Paragraph format with overall clinical assessment.',
    'Vaccines Administered': 'Use bullet points (•) for each vaccine given.',
    'Preventive Care Status': 'Use bullet points (•) for each preventive care item.',
    'Diet & Nutrition': 'Use bullet points (•) for diet and nutrition recommendations.',
    'Owner Discussion': 'Paragraph format summarizing discussion topics.',
    'Recommendations': 'Use bullet points (•) for each recommendation.',
    'Client Education': 'Use bullet points (•) for each educational point.'
  }
};

serve(async (req) => {
  // Handle CORS preflight requests
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

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    // Verify user authentication
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message || 'No user found');
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    // Check rate limit for AI function
    const rateLimitResponse = await withAIRateLimit(authClient, user.id, 'regenerate_section', corsHeaders);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { sectionContent, sectionTitle, instruction, originalInput, reportType } = await req.json();

    if (!sectionContent || !sectionTitle || !instruction) {
      return new Response(
        JSON.stringify({ error: 'Section content, title, and instruction are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let systemPrompt = `You are a professional veterinary medical document editor. Your task is to regenerate the content of a specific section of a veterinary medical record according to the user's instruction.

CRITICAL ANTI-HALLUCINATION RULES:
1. You must ONLY use information from the Original Source Material provided below.
2. If the instruction asks for "More detailed" but no additional details exist in the source, return the EXACT original content unchanged.
3. NEVER fabricate: lot numbers, dates, dosages, medications, diagnoses, vaccines, lab values, or any medical data.
4. If a field says "Not specified" or similar, keep it exactly as-is unless the source material actually contains that information.
5. Do NOT add explanatory text like "no additional information available" - just return the original content unchanged if you cannot elaborate.

GENERAL FORMATTING RULES:
1. Only return the regenerated content for this section, nothing else.
2. Maintain medical accuracy and professionalism.
3. Keep the same general structure and information unless the instruction asks otherwise.
4. Preserve any formatting like bullet points (•) if present.
5. For abnormal values wrapped in [[double brackets]], keep them marked as abnormal if still abnormal.
6. Do not add explanations or meta-commentary - just output the regenerated section content.
7. Do NOT use markdown formatting (no **, *, #, ##, ### symbols).
8. Use plain bullet points (•) for list items - no numbered lists (1. 2. 3.).
9. Use dashes (-) for sub-items under bullet points.`;

    // Add section-specific formatting rules based on report type
    const formatRule = reportType && sectionFormatRules[reportType]?.[sectionTitle];
    if (formatRule) {
      systemPrompt += `

SECTION-SPECIFIC FORMATTING FOR "${sectionTitle}":
${formatRule}

IMPORTANT: You MUST follow the formatting rules above for this section type.`;
    }

    const userPrompt = `Section Title: ${sectionTitle}

Current Section Content:
---
${sectionContent}
---

Original Source Material (transcription/notes - this is the ONLY source of truth):
---
${originalInput || 'No original source available - you must not add any new information.'}
---

Instruction: ${instruction}

Please provide the regenerated content for this section only. Remember: if asked for more detail but no additional detail exists in the source material, return the exact original content unchanged.`;

    console.log('[GEMINI-3-FLASH] Regenerating section:', sectionTitle, 'reportType:', reportType);

    const result = await callGemini({
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 4096,
      model: GEMINI_MODEL,
    });

    const regeneratedContent = result.content.trim();

    if (!regeneratedContent) {
      throw new Error('No response from AI');
    }

    console.log('[GEMINI-3-FLASH] Section regenerated successfully:', sectionTitle);

    return new Response(
      JSON.stringify({ regeneratedContent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in regenerate-section function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
