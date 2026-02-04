import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withAIRateLimit } from '../_shared/aiRateLimiter.ts';
import { callGemini, GEMINI_MODEL } from '../_shared/geminiClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const rateLimitResponse = await withAIRateLimit(authClient, user.id, 'rewrite_text', corsHeaders);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { originalText, selectedText, instruction } = await req.json();

    if (!selectedText || !instruction) {
      return new Response(
        JSON.stringify({ error: 'Selected text and instruction are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are a professional veterinary medical text editor. Your task is to rewrite the selected text according to the user's instruction while maintaining medical accuracy and professionalism.

Rules:
1. Only return the rewritten version of the selected text, nothing else.
2. Maintain the same general meaning unless instructed otherwise.
3. Keep medical terminology accurate.
4. Match the tone and style of the surrounding context.
5. Do not add explanations or notes - just output the rewritten text.`;

    const userPrompt = `Here is the full context:
---
${originalText}
---

Selected text to rewrite:
"${selectedText}"

Instruction: ${instruction}

Please provide the rewritten version of the selected text only:`;

    console.log('[GEMINI-3-FLASH] Calling Gemini API for text rewrite');

    const result = await callGemini({
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.3,
      maxTokens: 1024, // Reduced for faster response - rewrites are short
      model: GEMINI_MODEL,
    });

    const rewrittenText = result.content.trim();

    if (!rewrittenText) {
      throw new Error('No response from AI');
    }

    console.log('[GEMINI-3-FLASH] Text rewritten successfully');

    return new Response(
      JSON.stringify({ rewrittenText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in rewrite-text function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
