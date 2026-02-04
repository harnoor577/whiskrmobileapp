import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { withAIRateLimit } from '../_shared/aiRateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY'); // Keep for embeddings
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const PINECONE_API_KEY = Deno.env.get('PINECONE_API_KEY');
const PINECONE_HOST = Deno.env.get('PINECONE_HOST');

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const LOVABLE_AI_MODEL = 'google/gemini-3-flash-preview';

// Convert ArrayBuffer to base64 string
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}

const CLASSIFIER_PROMPT = `You are a veterinary document triage agent. Identify what the uploaded item is and return JSON only.

For document_type, be as specific as possible:
- Lab reports: "Blood Work", "Urine Report", "Fecal Analysis", "Chemistry Panel", "CBC", "Thyroid Panel", "Urinalysis"
- Imaging: "Chest X-ray", "Leg X-ray", "Abdomen X-ray", "Spine X-ray", "Ultrasound Abdomen", "Ultrasound Heart", "Echocardiogram"
- Other documents: "Surgical Report", "Consultation Note", "Vaccine Record", "Other Document"

For modality, use: "lab" | "xray" | "ultrasound" | "echo" | "photo" | "text" | "other".

Respond as strict JSON:
{
  "document_type": "...",
  "modality": "...",
  "confidence": 0.0,
  "source_file": {"name":"FILE_NAME","mime":"FILE_MIME"}
}`;

// Simplified LAB_ANALYZER_PROMPT - request concise output to prevent truncation
const LAB_ANALYZER_PROMPT = `You are a veterinary clinical lab interpreter for dogs and cats. Parse all lab values into a structured panel. Be CONCISE.

CRITICAL RULES:
1. Extract ALL lab analytes with exact values, units, and reference ranges
2. Keep notes/rationales brief (max 20 words each)
3. Limit differentials to TOP 3 most likely
4. Limit recommended_tests to TOP 4 most important

Return ONLY valid JSON matching this exact schema:
{
  "document_type": "lab_report",
  "modality": "lab",
  "confidence": 0.95,
  "source_file": {"name": "", "mime": ""},
  "summary": "Brief 1-2 sentence clinical summary",
  "labPanel": {
    "parsed": [{"analyte":"AnalyteName", "value":"123", "unit":"mg/dL", "flag":"high|low|normal", "refLow":"100", "refHigh":"200"}],
    "notes": "1-2 sentences on key abnormalities"
  },
  "differentials": [{"dx":"Diagnosis", "why":"Brief reason", "likelihood":"high|medium|low"}],
  "recommended_tests": [{"test":"TestName", "rationale":"Brief reason (max 15 words)"}]
}`;

const IMAGING_ANALYZER_PROMPT = `You are a veterinary imaging reader. Provide:
- "findings": objective image descriptions (location, size, opacity/echogenicity, distribution)
- "impression": 2–4 short bullets on likely meaning and differentials
- "anatomic_region": best-fit site
- "severity": mild|moderate|severe|unknown
- "summary": 2–3 lines in plain language

Do not give treatment. Output only JSON matching this schema:
{
  "document_type": "radiograph|ultrasound|echocardiogram",
  "modality": "xray|ultrasound|echo|photo|other_image",
  "confidence": 0.0,
  "source_file": {"name": "", "mime": ""},
  "summary": "",
  "imaging": {
    "findings": ["..."],
    "impression": ["..."],
    "anatomic_region": "",
    "severity": "mild|moderate|severe|unknown"
  },
  "differentials": [{"dx":"", "why":"", "likelihood":"high|medium|low"}],
  "recommended_tests": [{"test":"", "rationale":""}]
}`;

const OTHER_TEXT_ANALYZER_PROMPT = `You are a veterinary document summarizer. Extract medically relevant facts (measurements, diagnoses, recommendations) and place them into this JSON schema:
{
  "document_type": "other_text",
  "modality": "text",
  "confidence": 0.0,
  "source_file": {"name": "", "mime": ""},
  "summary": "",
  "differentials": [{"dx":"", "why":"", "likelihood":"high|medium|low"}],
  "recommended_tests": [{"test":"", "rationale":""}]
}

Output only valid JSON.`;

const MEDICAL_HISTORY_ANALYZER_PROMPT = `You are a veterinary medical records analyst. Extract patient demographics and medical history from this document.

Return ONLY valid JSON matching this exact schema:
{
  "document_type": "medical_history",
  "modality": "text",
  "confidence": 0.95,
  "source_file": {"name": "", "mime": ""},
  "summary": "Brief 2-3 sentence summary of document contents",
  "patient": {
    "name": "Patient name if found (look for actual pet names like 'Max', 'Bella', NOT 'patient' or 'the patient')",
    "species": "Dog/Cat/Canine/Feline etc",
    "breed": "Breed if mentioned",
    "sex": "Male/Female/M/F/Neutered Male/Spayed Female/Intact Male/Intact Female etc",
    "age": "Age in human-readable format (e.g., '4 years', '6 months')",
    "weight": {"value": 0, "unit": "kg or lb"}
  },
  "owner": {
    "name": "Owner/client name if found",
    "phone": "Phone number if found",
    "email": "Email if found"
  },
  "medical_history_summary": "Comprehensive summary of medical history, presenting complaints, and clinical findings",
  "diagnoses": ["List of diagnoses mentioned"],
  "medications": ["List of medications mentioned with dosages if available"],
  "allergies": ["List of allergies mentioned"]
}

IMPORTANT: 
- Extract the ACTUAL patient name from the document (pet name like 'Max', 'Bella', 'Charlie')
- Do NOT use generic terms like 'Patient' or 'the patient' as the name
- If weight is in pounds, convert to kg as well (1 lb = 0.453592 kg)
- Extract ALL medications with their dosages if available
- Look for allergy information in medication history, alerts, or warnings sections`;

const SYNTHESIZER_PROMPT = `You are a veterinary clinical assistant. Combine the uploaded document analysis with this active case:

Species: {{patient.species}}
Sex/Status: {{patient.sex}}
Age: {{patient.age}}
Weight: {{patient.weight}}
Presenting complaint: {{presentingComplaint}}
History: {{history}}
Physical exam: {{physicalExam}}

Goal: update the document JSON by aligning differentials and recommended_tests to the case details. If something in the document contradicts the case, note it briefly in "summary". Do not recommend therapy. End the "summary" with:
"Once you've confirmed the working diagnosis, I can give you a treatment plan."

CRITICAL: You MUST preserve the exact labPanel.parsed array and imaging.findings array from the original analysis - do not modify, remove, or summarize these values. They contain the actual lab measurements that must be displayed.

Return only the final JSON in the exact same schema format as the input, preserving all labPanel and imaging data.`;

// Helper to build OpenAI-compatible messages with multimodal content
function buildMessages(systemPrompt: string, userContent: any): any[] {
  const messages: any[] = [
    { role: 'system', content: systemPrompt }
  ];

  if (Array.isArray(userContent)) {
    // Multimodal content - convert to OpenAI format
    const contentParts: any[] = [];
    for (const item of userContent) {
      if (item.type === 'text') {
        contentParts.push({ type: 'text', text: item.text });
      } else if (item.inlineData) {
        // Convert Gemini inlineData to OpenAI image_url format with data URL
        const dataUrl = `data:${item.inlineData.mimeType};base64,${item.inlineData.data}`;
        contentParts.push({ 
          type: 'image_url', 
          image_url: { url: dataUrl }
        });
      }
    }
    messages.push({ role: 'user', content: contentParts });
  } else if (typeof userContent === 'string') {
    messages.push({ role: 'user', content: userContent });
  }

  return messages;
}

// Convert data URL to multimodal content format
function dataUrlToMultimodal(dataUrl: string): { inlineData: { mimeType: string; data: string } } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL format');
  }
  return {
    inlineData: {
      mimeType: match[1],
      data: match[2]
    }
  };
}

// Helper to call Lovable AI Gateway with streaming support
async function callLovableAIWithStreaming(systemPrompt: string, userContent: any, maxTokens: number = 4096): Promise<{ content: string; finishReason: string }> {
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  console.log('[LOVABLE-AI] Starting streaming request with maxTokens:', maxTokens);

  const messages = buildMessages(systemPrompt, userContent);

  const response = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: LOVABLE_AI_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
      stream: true,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (response.status === 402) {
      throw new Error('Payment required. Please add funds to your Lovable AI workspace.');
    }
    const errorText = await response.text();
    console.error('[LOVABLE-AI] API error:', response.status, errorText);
    throw new Error(`Lovable AI API error: ${response.status}`);
  }

  // Collect streaming response (OpenAI SSE format)
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let fullContent = '';
  let finishReason = 'unknown';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            // OpenAI streaming format
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
            }
            const reason = parsed.choices?.[0]?.finish_reason;
            if (reason) {
              finishReason = reason.toLowerCase();
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  console.log('[LOVABLE-AI] Streaming complete. Content length:', fullContent.length, 'finishReason:', finishReason);

  if (!fullContent) {
    throw new Error('No content received from Lovable AI');
  }

  return { content: fullContent, finishReason };
}

// Non-streaming Lovable AI call for simpler operations
async function callLovableAI(systemPrompt: string, userContent: any, maxTokens: number = 4096): Promise<string> {
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const messages = buildMessages(systemPrompt, userContent);

  const response = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: LOVABLE_AI_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (response.status === 402) {
      throw new Error('Payment required. Please add funds to your Lovable AI workspace.');
    }
    const errorText = await response.text();
    console.error('[LOVABLE-AI] API error:', response.status, errorText);
    throw new Error(`Lovable AI API error: ${response.status}`);
  }

  const data = await response.json();
  
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    console.error('No content in response:', JSON.stringify(data));
    throw new Error('No response from Lovable AI');
  }

  return text;
}

// Enhanced JSON repair with more truncation patterns
function repairTruncatedJson(jsonStr: string): string {
  let repaired = jsonStr;
  
  // Count brackets to detect truncation
  const openBraces = (repaired.match(/{/g) || []).length;
  const closeBraces = (repaired.match(/}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/]/g) || []).length;
  
  console.log('[repairTruncatedJson] Bracket analysis:', { openBraces, closeBraces, openBrackets, closeBrackets });
  
  // Pattern 1: Truncated after key with colon and quote (e.g., "rationale": "some text)
  if (repaired.match(/:\s*"[^"]*$/)) {
    console.log('[repairTruncatedJson] Pattern 1: Closing truncated string value');
    repaired += '"';
  }
  
  // Pattern 2: Truncated after key with colon, no quote yet (e.g., "rationale":)
  if (repaired.match(/:\s*$/)) {
    console.log('[repairTruncatedJson] Pattern 2: Adding empty string for truncated key');
    repaired += '""';
  }
  
  // Pattern 3: Truncated mid-object after comma (e.g., {"test": "value",)
  if (repaired.match(/,\s*$/)) {
    console.log('[repairTruncatedJson] Pattern 3: Removing trailing comma');
    repaired = repaired.replace(/,\s*$/, '');
  }
  
  // Pattern 4: Truncated after opening brace for object in array (e.g., [{"test": "v"}, {)
  if (repaired.match(/\{\s*$/)) {
    console.log('[repairTruncatedJson] Pattern 4: Removing incomplete object');
    repaired = repaired.replace(/,?\s*\{\s*$/, '');
  }
  
  // Pattern 5: Truncated after opening bracket for array (e.g., "items": [)
  if (repaired.match(/\[\s*$/)) {
    console.log('[repairTruncatedJson] Pattern 5: Closing empty array');
    repaired += ']';
  }
  
  // Now add missing closing brackets/braces
  const newOpenBraces = (repaired.match(/{/g) || []).length;
  const newCloseBraces = (repaired.match(/}/g) || []).length;
  const newOpenBrackets = (repaired.match(/\[/g) || []).length;
  const newCloseBrackets = (repaired.match(/]/g) || []).length;
  
  const missingBrackets = newOpenBrackets - newCloseBrackets;
  const missingBraces = newOpenBraces - newCloseBraces;
  
  if (missingBrackets > 0 || missingBraces > 0) {
    console.log('[repairTruncatedJson] Adding missing closers:', { missingBrackets, missingBraces });
    
    // Remove any trailing comma before closing
    repaired = repaired.replace(/,\s*$/, '');
    
    // Add missing closers - try to maintain proper nesting by analyzing the end
    // Simple approach: add brackets first, then braces
    for (let i = 0; i < missingBrackets; i++) {
      repaired += ']';
    }
    for (let i = 0; i < missingBraces; i++) {
      repaired += '}';
    }
  }
  
  return repaired;
}

// Parse JSON from response, handling markdown code blocks and truncation
function parseJsonResponse(content: string, finishReason?: string): any {
  let jsonStr = content.trim();
  
  console.log('[parseJsonResponse] Raw content length:', content.length, 'finishReason:', finishReason || 'not provided');
  
  // Check if response was truncated due to token limit
  if (finishReason === 'length' || finishReason === 'max_tokens') {
    console.warn('[parseJsonResponse] Response was truncated due to token limit');
  }
  
  // Remove markdown code blocks if present
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  
  jsonStr = jsonStr.trim();
  
  // Try normal parsing first
  try {
    return JSON.parse(jsonStr);
  } catch (initialError) {
    console.warn('[parseJsonResponse] Initial parse failed, attempting repair...');
    console.warn('[parseJsonResponse] Error:', initialError instanceof Error ? initialError.message : initialError);
    
    // Attempt to repair truncated JSON
    const repaired = repairTruncatedJson(jsonStr);
    
    try {
      const parsed = JSON.parse(repaired);
      console.log('[parseJsonResponse] Repair successful');
      return parsed;
    } catch (repairError) {
      console.error('[parseJsonResponse] Repair failed:', repairError instanceof Error ? repairError.message : repairError);
      console.error('[parseJsonResponse] First 500 chars:', jsonStr.substring(0, 500));
      console.error('[parseJsonResponse] Last 500 chars:', jsonStr.substring(jsonStr.length - 500));
      throw new Error(`Failed to parse AI response: ${initialError instanceof Error ? initialError.message : 'Invalid JSON'}`);
    }
  }
}

// Simplified fallback prompt for when main analysis fails
const SIMPLE_LAB_PROMPT = `Extract lab values from this report. Return ONLY a JSON object with this exact structure:
{
  "document_type": "lab_report",
  "modality": "lab", 
  "confidence": 0.9,
  "summary": "Brief summary",
  "labPanel": {
    "parsed": [{"analyte": "NAME", "value": "VALUE", "unit": "UNIT", "flag": "high|low|normal", "refLow": "", "refHigh": ""}],
    "notes": "Key findings"
  },
  "differentials": [],
  "recommended_tests": []
}
Keep output under 4000 characters. Include all lab values.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Step 0: Authenticate user before processing
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase credentials');
    }

    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    if (!SUPABASE_ANON_KEY) {
      throw new Error('Missing SUPABASE_ANON_KEY');
    }

    // Create client with user's auth token for verification
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify user authentication
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
    const rateLimitResponse = await withAIRateLimit(authClient, user.id, 'analyze_document', corsHeaders);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Get user's clinic for access verification
    const { data: userProfile, error: profileError } = await authClient
      .from('profiles')
      .select('clinic_id')
      .eq('user_id', user.id)
      .single();

    if (profileError || !userProfile) {
      console.error('Profile not found for user:', user.id);
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { 
      caseId, 
      conversationId, 
      patient, 
      presentingComplaint, 
      history, 
      physicalExam, 
      file,
      extractPatientInfo // Flag for medical history extraction mode
    } = await req.json();

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Create service role client for privileged operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('Starting document analysis for file:', file.name);

    // Verify file belongs to user's clinic
    const { data: fileAsset, error: fileAssetError } = await supabase
      .from('file_assets')
      .select('clinic_id, document_type')
      .eq('id', file.id)
      .single();

    if (fileAssetError || !fileAsset) {
      console.error('File not found:', file.id);
      return new Response(
        JSON.stringify({ error: 'File not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (fileAsset.clinic_id !== userProfile.clinic_id) {
      console.error('Clinic access denied:', { userClinic: userProfile.clinic_id, fileClinic: fileAsset.clinic_id });
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Access denied to this file' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Clinic access verified for file:', file.id);

    // Determine the correct storage bucket based on document_type
    const storageBucket = fileAsset.document_type === 'medical_history' 
      ? 'medical-history' 
      : 'diagnostic-images';
    
    console.log('Using storage bucket:', storageBucket, 'for document_type:', fileAsset.document_type);

    // Step 1: Get file content and convert to base64
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from(storageBucket)
      .createSignedUrl(file.storagePath, 3600);

    if (urlError || !signedUrlData?.signedUrl) {
      console.error('Failed to get signed URL:', urlError);
      throw new Error('Failed to get file URL');
    }

    const isImage = file.mime.startsWith('image/');
    const isPdf = file.mime === 'application/pdf';
    const useVision = isImage || isPdf;
    
    let base64DataUrl = '';

    // Convert file to base64 for vision API (supports both images and PDFs)
    if (useVision) {
      console.log('Converting file to base64 for vision analysis...');
      try {
        const fileResponse = await fetch(signedUrlData.signedUrl);
        const fileBuffer = await fileResponse.arrayBuffer();
        const base64Data = arrayBufferToBase64(fileBuffer);
        base64DataUrl = `data:${file.mime};base64,${base64Data}`;
        console.log('File converted to base64, data URL length:', base64DataUrl.length);
      } catch (fileError) {
        console.error('File conversion error:', fileError);
        throw new Error('Failed to process file');
      }
    }

    console.log('Document type detection:', { isImage, isPdf, useVision, mime: file.mime });

    // Hint based on common lab report patterns in filename
    const fileNameLower = file.name.toLowerCase();
    const isLikelyLabReport = fileNameLower.includes('idexx') || 
                              fileNameLower.includes('result') || 
                              fileNameLower.includes('lab') ||
                              fileNameLower.includes('blood') ||
                              fileNameLower.includes('cbc') ||
                              fileNameLower.includes('chemistry');
    
    if (isLikelyLabReport) {
      console.log('Filename suggests lab report - will prioritize lab analyzer');
    }

    // Step 2: Classify document using Lovable AI
    console.log('[LOVABLE-AI] Classifying document...');
    const classificationContent: any[] = [];

    if (useVision) {
      classificationContent.push(
        { type: 'text', text: `${CLASSIFIER_PROMPT}\n\nClassify this veterinary document. File: ${file.name}, MIME: ${file.mime}. ${isLikelyLabReport ? 'Note: filename suggests this is a laboratory report.' : ''}` },
        dataUrlToMultimodal(base64DataUrl)
      );
    } else {
      classificationContent.push(
        { type: 'text', text: `${CLASSIFIER_PROMPT}\n\nClassify this veterinary document based on the filename: ${file.name}. ${isLikelyLabReport ? 'The filename contains keywords suggesting this is a laboratory report.' : ''}` }
      );
    }

    const classificationResult = await callLovableAI(CLASSIFIER_PROMPT, classificationContent, 500);
    const classification = parseJsonResponse(classificationResult);
    
    console.log('Classification result:', classification);

    if (classification.confidence < 0.5) {
      console.warn('Low confidence classification:', classification.confidence);
    }

    // Step 3: Analyze based on document type
    console.log('[LOVABLE-AI] Analyzing document...');
    let analyzerPrompt = OTHER_TEXT_ANALYZER_PROMPT;
    
    // Determine analyzer based on modality rather than exact document_type
    const docTypeLower = classification.document_type.toLowerCase();
    const isLabAnalysis = classification.modality === 'lab' || docTypeLower.includes('blood') || docTypeLower.includes('urine') || docTypeLower.includes('cbc') || docTypeLower.includes('chemistry') || docTypeLower.includes('fecal') || isLikelyLabReport;
    
    // Check for medical history extraction mode FIRST
    if (extractPatientInfo) {
      analyzerPrompt = MEDICAL_HISTORY_ANALYZER_PROMPT;
      console.log('Using MEDICAL_HISTORY_ANALYZER_PROMPT for patient info extraction');
    } else if (isLabAnalysis) {
      analyzerPrompt = LAB_ANALYZER_PROMPT;
      console.log('Using LAB_ANALYZER_PROMPT');
    } else if (classification.modality === 'xray' || classification.modality === 'ultrasound' || classification.modality === 'echo' || docTypeLower.includes('x-ray') || docTypeLower.includes('xray') || docTypeLower.includes('ultrasound') || docTypeLower.includes('echo')) {
      analyzerPrompt = IMAGING_ANALYZER_PROMPT;
      console.log('Using IMAGING_ANALYZER_PROMPT');
    } else {
      console.log('Using OTHER_TEXT_ANALYZER_PROMPT');
    }

    const analysisContent: any[] = [];

    if (useVision) {
      analysisContent.push(
        { type: 'text', text: `${analyzerPrompt}\n\nAnalyze this ${classification.document_type}. Extract ALL lab values with their exact analyte names, measured values, units, and reference ranges. Be concise in notes and rationales.` },
        dataUrlToMultimodal(base64DataUrl)
      );
    } else {
      analysisContent.push(
        { type: 'text', text: `${analyzerPrompt}\n\nAnalyze this ${classification.document_type}. File: ${file.name}` }
      );
    }

    let analysis: any;
    let analysisSucceeded = false;

    // Use streaming for lab analysis to handle long responses
    if (isLabAnalysis) {
      console.log('[Analysis] Using streaming for lab analysis...');
      try {
        const { content: analysisResult, finishReason } = await callLovableAIWithStreaming(analyzerPrompt, analysisContent, 12000);
        console.log('[Analysis] Streaming response length:', analysisResult.length, 'chars, finishReason:', finishReason);
        
        // Check if truncated
        if (finishReason === 'length' || finishReason === 'max_tokens') {
          console.warn('[Analysis] Response was truncated due to token limit');
        }
        
        analysis = parseJsonResponse(analysisResult, finishReason);
        analysisSucceeded = true;
        console.log('Analysis complete, labPanel count:', analysis.labPanel?.parsed?.length || 0);
      } catch (parseError) {
        console.error('[Analysis] Primary analysis failed:', parseError);
        
        // Fallback: try with simpler prompt
        console.log('[Analysis] Attempting fallback with simplified prompt...');
        const fallbackContent: any[] = [];
        
        if (useVision) {
          fallbackContent.push(
            { type: 'text', text: SIMPLE_LAB_PROMPT },
            dataUrlToMultimodal(base64DataUrl)
          );
        } else {
          fallbackContent.push(
            { type: 'text', text: `${SIMPLE_LAB_PROMPT}\n\nFile: ${file.name}` }
          );
        }
        
        try {
          const fallbackResult = await callLovableAI(SIMPLE_LAB_PROMPT, fallbackContent, 6000);
          console.log('[Analysis] Fallback response length:', fallbackResult.length);
          analysis = parseJsonResponse(fallbackResult);
          analysisSucceeded = true;
          console.log('[Analysis] Fallback succeeded, labPanel count:', analysis.labPanel?.parsed?.length || 0);
        } catch (fallbackError) {
          console.error('[Analysis] Fallback also failed:', fallbackError);
          throw parseError; // Throw original error
        }
      }
    } else {
      // Non-lab analysis - use regular call
      const analysisResult = await callLovableAI(analyzerPrompt, analysisContent, 8000);
      console.log('[Analysis] Response length:', analysisResult.length, 'chars');
      analysis = parseJsonResponse(analysisResult);
      analysisSucceeded = true;
      console.log('Analysis complete');
    }

    // Step 4: Synthesize with case context
    if (patient || presentingComplaint || history || physicalExam) {
      console.log('Synthesizing with case context...');
      
      const synthesizerPrompt = SYNTHESIZER_PROMPT
        .replace('{{patient.species}}', patient?.species || 'Unknown')
        .replace('{{patient.sex}}', patient?.sex || 'Unknown')
        .replace('{{patient.age}}', patient?.date_of_birth ? calculateAge(patient.date_of_birth) : 'not recorded')
        .replace('{{patient.weight}}', patient?.weight || 'Unknown')
        .replace('{{presentingComplaint}}', presentingComplaint || 'Not provided')
        .replace('{{history}}', history || 'Not provided')
        .replace('{{physicalExam}}', physicalExam || 'Not provided');

      const synthesisResult = await callLovableAI(synthesizerPrompt, `Document analysis to synthesize:\n${JSON.stringify(analysis, null, 2)}`, 4000);
      const originalLabPanel = analysis.labPanel;
      const originalImaging = analysis.imaging;
      
      console.log('[Synthesis] Original labPanel count:', originalLabPanel?.parsed?.length || 0);
      
      const synthesizedAnalysis = parseJsonResponse(synthesisResult);
      
      console.log('[Synthesis] Synthesized labPanel count:', synthesizedAnalysis.labPanel?.parsed?.length || 0);
      
      // Defensive merge: preserve original labPanel if synthesized version is missing/empty
      if (originalLabPanel?.parsed?.length > 0 && 
          (!synthesizedAnalysis.labPanel?.parsed || synthesizedAnalysis.labPanel.parsed.length === 0)) {
        console.log('[Synthesis] Restoring original labPanel - was lost during synthesis');
        synthesizedAnalysis.labPanel = originalLabPanel;
      }
      
      // Defensive merge: preserve original imaging if synthesized version is missing/empty
      if (originalImaging?.findings?.length > 0 && 
          (!synthesizedAnalysis.imaging?.findings || synthesizedAnalysis.imaging.findings.length === 0)) {
        console.log('[Synthesis] Restoring original imaging - was lost during synthesis');
        synthesizedAnalysis.imaging = originalImaging;
      }
      
      analysis = synthesizedAnalysis;
      
      console.log('Synthesis complete, final labPanel count:', analysis.labPanel?.parsed?.length || 0);
    }

    // Step 5: Update database
    // Preserve document_type when extractPatientInfo is true (medical history import)
    const { error: updateError } = await supabase
      .from('file_assets')
      .update({
        analysis_json: analysis,
        // Only update document_type if NOT a medical history extraction
        ...(extractPatientInfo ? {} : { document_type: classification.document_type }),
        modality: classification.modality,
        confidence: classification.confidence
      })
      .eq('id', file.id);

    if (updateError) {
      console.error('Error updating file_assets:', updateError);
    }

    if (caseId) {
      const { error: consultError } = await supabase
        .from('consults')
        .update({ last_analysis_at: new Date().toISOString() })
        .eq('id', caseId);

      if (consultError) {
        console.error('Error updating consult:', consultError);
      }
    }

    // Step 6: Optional Pinecone upsert (still uses OpenAI for embeddings)
    if (PINECONE_API_KEY && PINECONE_HOST && conversationId && OPENAI_API_KEY) {
      try {
        console.log('Upserting to Pinecone...');
        
        let textToEmbed = analysis.summary || '';
        
        if (analysis.imaging?.impression) {
          textToEmbed += '\n' + analysis.imaging.impression.join('\n');
        }
        
        if (analysis.labPanel?.parsed) {
          const abnormalLabs = analysis.labPanel.parsed
            .filter((lab: any) => lab.flag !== 'normal')
            .map((lab: any) => `${lab.analyte}: ${lab.value} ${lab.unit} (${lab.flag})`)
            .join(', ');
          if (abnormalLabs) {
            textToEmbed += '\n' + abnormalLabs;
          }
          if (analysis.labPanel.notes) {
            textToEmbed += '\n' + analysis.labPanel.notes;
          }
        }

        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: textToEmbed,
          }),
        });

        const embeddingData = await embeddingResponse.json();
        const embedding = embeddingData.data[0].embedding;

        await fetch(`${PINECONE_HOST}/vectors/upsert`, {
          method: 'POST',
          headers: {
            'Api-Key': PINECONE_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            vectors: [{
              id: `file_${file.id}`,
              values: embedding,
              metadata: {
                conversationId,
                type: 'document_analysis',
                documentType: classification.document_type,
                text: textToEmbed,
              },
            }],
            namespace: `conv:${conversationId}`,
          }),
        });

        console.log('Pinecone upsert complete');
      } catch (pineconeError) {
        console.error('Pinecone upsert failed:', pineconeError);
        // Don't fail the whole request if Pinecone fails
      }
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      analysis,
      lowConfidence: classification.confidence < 0.5 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-document:', error);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: error instanceof Error ? error.message : 'An error occurred processing your request',
      code: 'INTERNAL_ERROR'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function calculateAge(dateOfBirth: string): string {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  const years = now.getFullYear() - dob.getFullYear();
  const months = now.getMonth() - dob.getMonth();
  
  if (years > 0) {
    return `${years} year${years > 1 ? 's' : ''}`;
  } else if (months > 0) {
    return `${months} month${months > 1 ? 's' : ''}`;
  } else {
    const days = Math.floor((now.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24));
    return `${days} day${days > 1 ? 's' : ''}`;
  }
}
