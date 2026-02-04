import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const key = Deno.env.get("VAPID_PUBLIC_KEY") || Deno.env.get("VITE_VAPID_PUBLIC_KEY");

    if (!key) {
      return new Response(
        JSON.stringify({ error: "VAPID public key not set" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    return new Response(
      JSON.stringify({ key }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: any) {
    console.error("[GET-VAPID-PUBLIC-KEY] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: "An error occurred retrieving VAPID key",
        code: "VAPID_ERROR"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});