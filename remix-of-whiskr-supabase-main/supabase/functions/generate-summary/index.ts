import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withAIRateLimit } from '../_shared/aiRateLimiter.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SummaryRequest {
  consultId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
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
    const rateLimitResponse = await withAIRateLimit(supabase, user.id, 'generate_summary', corsHeaders);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { consultId }: SummaryRequest = await req.json();

    // Fetch consult data
    const { data: consult, error: consultError } = await supabase
      .from('consults')
      .select('soap_s, soap_o, soap_a, soap_p, reason_for_visit, final_treatment_plan, final_summary')
      .eq('id', consultId)
      .maybeSingle();

    if (consultError) {
      throw new Error(`Database error: ${consultError.message}`);
    }
    if (!consult) {
      throw new Error(`Consult not found with ID: ${consultId}`);
    }

    // Return existing summary if available
    if (consult.final_summary) {
      return new Response(
        JSON.stringify({ summary: consult.final_summary }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Check if there's any SOAP data or finalized plan to summarize
    const hasData = consult.soap_s || consult.soap_o || consult.soap_a || consult.soap_p || consult.final_treatment_plan;
    
    if (!hasData) {
      // Check if there are chat messages with treatment plan content
      const { data: messages } = await supabase
        .from('chat_messages')
        .select('content, role')
        .eq('consult_id', consultId)
        .order('created_at', { ascending: false })
        .limit(10);

      // Look for assistant messages that might contain treatment plan
      const assistantMessages = messages?.filter(m => m.role === 'assistant') || [];
      const hasChatContent = assistantMessages.length > 0 && 
        assistantMessages.some(m => m.content && m.content.length > 100);

      if (!hasChatContent) {
        return new Response(
          JSON.stringify({ 
            summary: "No consultation data available yet. Please complete the consultation to generate a summary." 
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }

      // Use chat messages for summary if SOAP fields are empty
      const chatContext = assistantMessages.slice(0, 3).map(m => m.content).join('\n\n');
      const prompt = `Based on this veterinary consultation discussion, provide a brief 2-3 sentence summary of the diagnosis and treatment plan:

${chatContext}

Provide only the summary, no additional text.`;

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        throw new Error("LOVABLE_API_KEY not configured");
      }

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are a veterinary AI assistant. Provide clear, concise clinical summaries." },
            { role: "user", content: prompt }
          ],
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error("AI Gateway error:", aiResponse.status, errorText);
        throw new Error("Failed to generate summary");
      }

      const aiData = await aiResponse.json();
      const summary = aiData.choices?.[0]?.message?.content || "Summary not available";

      return new Response(JSON.stringify({ summary }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Call Lovable AI Gateway for summary generation
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const prompt = `Based on this veterinary consultation, provide a brief 2-3 sentence summary of the diagnosis and treatment plan:

SUBJECTIVE: ${consult.soap_s || 'N/A'}
OBJECTIVE: ${consult.soap_o || 'N/A'}
ASSESSMENT: ${consult.soap_a || 'N/A'}
PLAN: ${consult.final_treatment_plan || consult.soap_p || 'N/A'}

Provide only the summary, no additional text.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { 
            role: "system", 
            content: "You are a veterinary AI assistant. Provide clear, concise clinical summaries." 
          },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      throw new Error("Failed to generate summary");
    }

    const aiData = await aiResponse.json();
    const summary = aiData.choices?.[0]?.message?.content || "Summary not available";

    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in generate-summary:", error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
