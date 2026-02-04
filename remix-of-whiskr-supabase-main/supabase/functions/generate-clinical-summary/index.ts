import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const systemPrompt = `You are a veterinary clinical assistant creating brief chart summaries for veterinarians.

OUTPUT FORMAT (exactly 2-5 bullet points, each on a new line starting with •):
• CC: Chief complaint in 5 words or less
• Findings: Only abnormal physical exam findings, vitals if abnormal
• Dx: Primary diagnosis only
• Tx: Medications with dose (name + dose only, no instructions)
• Procedure: Name and outcome if applicable

RULES:
- Use standard clinical abbreviations: CC, Dx, Tx, BID, TID, SID, PRN
- NO client-facing language ("we understand", "don't worry")
- NO template markers like [[value]] - extract the actual values
- NO full sentences - use telegraphic clinical style
- Vitals only if abnormal (T>102.5°F, HR/RR out of range)
- Maximum 15 words per bullet point
- Skip any category that has no meaningful data
- When multiple report types exist, combine into ONE unified summary
- Avoid duplicating information across bullet points

EXAMPLES:

SOAP Visit:
• CC: Vomiting, diarrhea x3 days
• Findings: T 103.5°F, dehydrated, abdominal pain
• Dx: Acute gastroenteritis
• Tx: Metronidazole 250mg BID, Cerenia 30mg SID

Wellness Visit:
• Status: Healthy, BCS 5/9
• Vaccines: Rabies 1yr, DHPP booster
• Due: Heartworm test 12mo

Procedure:
• Procedure: Dental prophylaxis, 2 extractions
• Indication: Grade 3 periodontal disease
• Recovery: Uneventful

Combined SOAP + Procedure:
• CC: Dental cleaning + mass removal
• Findings: Grade 2 dental disease, 1cm lipoma R flank
• Procedure: Dental prophylaxis, lipoma excision - complete
• Tx: Carprofen 50mg BID x5d, Clavamox 375mg BID x7d

Imported Medical History:
• Presenting: Ear recheck - improvement reported
• Status: T 101.1°F, BCS 5/9, BAR, ears minimal debris
• Hx: Otitis externa - resolved, allergic dermatitis - improving
• Allergies: NKDA`;

// Detect ALL available report types in a consult
function getAvailableReportTypes(consult: any): string[] {
  const types: string[] = [];
  
  // Check for euthanasia first (exclusive type)
  const isEuthanasia = consult.visit_type === 'euthanasia' || 
    consult.reason_for_visit?.toLowerCase()?.includes('euthanasia') ||
    consult.reason_for_visit?.toLowerCase()?.includes('humane end');
  if (isEuthanasia) {
    return ['euthanasia'];
  }

  // Check for SOAP data
  if (consult.soap_s || consult.soap_o || consult.soap_a || consult.soap_p) {
    types.push('soap');
  }
  
  // Check case_notes for structured data
  if (consult.case_notes) {
    try {
      const parsed = JSON.parse(consult.case_notes);
      if (parsed.imported_medical_history) {
        return ['medical_history']; // Medical history is also exclusive
      }
      if (parsed.wellness && Object.keys(parsed.wellness).length > 0) {
        types.push('wellness');
      }
      if (parsed.procedure && Object.keys(parsed.procedure).length > 0) {
        types.push('procedure');
      }
    } catch {
      // Not JSON, continue
    }
  }
  
  // If no types detected, default to soap
  return types.length > 0 ? types : ['soap'];
}

function preparePromptData(consult: any, visitType: string): string {
  // Strip template markers from text
  const stripMarkers = (text: string | null | undefined): string => {
    if (!text) return '';
    return text.replace(/\[\[([^\]]+)\]\]/g, '$1');
  };

  switch (visitType) {
    case 'medical_history': {
      let historyData: any = {};
      try {
        const parsed = JSON.parse(consult.case_notes || '{}');
        historyData = parsed.imported_medical_history || {};
      } catch {}
      
      const summary = historyData.summary_narrative || historyData.summary || '';
      const diagnoses = historyData.past_diagnoses || historyData.diagnoses || [];
      const allergies = historyData.allergies || [];
      
      const diagnosesStr = Array.isArray(diagnoses) 
        ? diagnoses.map((d: any) => typeof d === 'string' ? d : (d.diagnosis || d.name || '')).filter(Boolean).join(', ')
        : '';
      const allergiesStr = Array.isArray(allergies)
        ? allergies.map((a: any) => typeof a === 'string' ? a : (a.allergen || '')).filter(Boolean).join(', ')
        : '';
      
      return `IMPORTED MEDICAL HISTORY:
Summary: ${summary}
Past Diagnoses: ${diagnosesStr || 'None documented'}
Allergies: ${allergiesStr || 'NKDA'}`;
    }
    
    case 'wellness': {
      let wellnessData: any = {};
      try {
        const parsed = JSON.parse(consult.case_notes || '{}');
        wellnessData = parsed.wellness || {};
      } catch {}
      
      return `WELLNESS EXAM:
Vitals & Weight: ${stripMarkers(wellnessData.vitalsWeightManagement)}
Physical Exam: ${stripMarkers(wellnessData.physicalExamination)}
Assessment: ${stripMarkers(wellnessData.assessment)}
Vaccines Administered: ${stripMarkers(wellnessData.vaccinesAdministered)}
Preventive Care: ${stripMarkers(wellnessData.preventiveCareStatus)}
Diet & Nutrition: ${stripMarkers(wellnessData.dietNutrition)}
Recommendations: ${stripMarkers(wellnessData.recommendations)}`;
    }
    
    case 'procedure': {
      let procedureData: any = {};
      try {
        const parsed = JSON.parse(consult.case_notes || '{}');
        procedureData = parsed.procedure || {};
      } catch {}
      
      return `PROCEDURE:
Name: ${consult.procedure_name || stripMarkers(procedureData.procedureSummary || procedureData.summary)}
Indication: ${consult.procedure_indication || stripMarkers(procedureData.preProcedureAssessment)}
Post-Procedure Status: ${stripMarkers(procedureData.postProcedureStatus || procedureData.recovery)}
Medications: ${stripMarkers(procedureData.medicationsAdministered)}
Instructions: ${stripMarkers(procedureData.dischargeInstructions)}`;
    }
    
    case 'euthanasia':
      return `EUTHANASIA:
Reason: ${consult.reason_for_visit || 'Not specified'}
Notes: Patient passed away`;
    
    default: // soap
      return `SOAP VISIT:
Chief Complaint: ${consult.reason_for_visit || 'Not specified'}
Subjective: ${stripMarkers(consult.soap_s)}
Objective: ${stripMarkers(consult.soap_o)}
Assessment: ${stripMarkers(consult.soap_a)}
Plan: ${stripMarkers(consult.soap_p)}`;
  }
}

// Combine prompt data from all available report types
function prepareCombinedPromptData(consult: any, reportTypes: string[]): string {
  const sections: string[] = [];
  
  for (const type of reportTypes) {
    const data = preparePromptData(consult, type);
    if (data) {
      sections.push(data);
    }
  }
  
  return sections.join('\n\n---\n\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { consultId } = await req.json();
    
    if (!consultId) {
      return new Response(
        JSON.stringify({ error: 'consultId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch consult data
    const { data: consult, error: fetchError } = await supabase
      .from('consults')
      .select('*')
      .eq('id', consultId)
      .single();

    if (fetchError || !consult) {
      console.error('Error fetching consult:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Consult not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if summary already exists
    if (consult.clinical_summary) {
      return new Response(
        JSON.stringify({ summary: consult.clinical_summary, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Detect ALL available report types
    const reportTypes = getAvailableReportTypes(consult);
    const combinedPromptData = prepareCombinedPromptData(consult, reportTypes);
    const reportTypesLabel = reportTypes.map(t => t.toUpperCase()).join(' + ');

    console.log(`[LOVABLE-AI] Generating clinical summary for consult ${consultId}, types: ${reportTypesLabel}`);

    // Call Lovable AI Gateway
    const aiResponse = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Summarize this visit (${reportTypesLabel}):\n\n${combinedPromptData}` }
        ],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[LOVABLE-AI] Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limits exceeded, please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required, please add funds to your Lovable AI workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 503) {
        return new Response(
          JSON.stringify({ error: 'AI service overloaded, please try again' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Lovable AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const summary = aiData.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      throw new Error('No summary generated');
    }

    // Cache the summary in the database
    const { error: updateError } = await supabase
      .from('consults')
      .update({ clinical_summary: summary })
      .eq('id', consultId);

    if (updateError) {
      console.error('Error caching summary:', updateError);
      // Still return the summary even if caching fails
    }

    console.log(`[LOVABLE-AI] Clinical summary generated and cached for consult ${consultId}, types: ${reportTypesLabel}`);

    return new Response(
      JSON.stringify({ summary, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-clinical-summary:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
