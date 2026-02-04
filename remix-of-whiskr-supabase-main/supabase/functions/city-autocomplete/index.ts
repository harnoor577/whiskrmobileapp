import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { checkRateLimit, recordAttempt, getClientIP } from '../_shared/rateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get client IP for rate limiting
    const clientIP = getClientIP(req);

    // Check rate limit: 10 requests per hour (60 minutes)
    const rateLimit = await checkRateLimit(supabase, clientIP, 'city_autocomplete', {
      maxAttempts: 10,
      windowMinutes: 60,
      enableLockout: false
    });

    if (!rateLimit.allowed) {
      const retryAfter = rateLimit.retryAfter 
        ? Math.ceil((rateLimit.retryAfter.getTime() - Date.now()) / 1000 / 60) 
        : 60;
      
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED',
          retry_after_minutes: retryAfter,
          suggestions: [] 
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter * 60)
          } 
        }
      );
    }

    const { query } = await req.json();
    
    if (!query || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: "You are a helpful assistant that provides accurate city location suggestions for veterinary practice locations. Always provide real, valid cities with complete location information."
          },
          {
            role: "user",
            content: `A veterinarian is typing their practice location. They've entered: "${query}". Provide 5-8 real city suggestions that match this input, with full location details.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_cities",
              description: "Return city suggestions with complete location information",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        city: { type: "string", description: "City name" },
                        state: { type: "string", description: "State or province name" },
                        country: { type: "string", description: "Country name" }
                      },
                      required: ["city", "state", "country"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["suggestions"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "suggest_cities" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to get city suggestions", suggestions: [] }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      console.error("No tool call in response:", data);
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const suggestions = JSON.parse(toolCall.function.arguments).suggestions || [];

    // Record this request for rate limiting
    await recordAttempt(supabase, clientIP, 'city_autocomplete', 60);

    return new Response(
      JSON.stringify({ suggestions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CITY-AUTOCOMPLETE] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'An error occurred fetching suggestions',
        code: 'AUTOCOMPLETE_ERROR',
        suggestions: [] 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
