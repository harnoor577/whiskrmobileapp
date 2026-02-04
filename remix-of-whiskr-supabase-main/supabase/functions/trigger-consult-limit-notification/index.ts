import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[TRIGGER-CONSULT-LIMIT-NOTIFICATION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { record } = await req.json();
    
    if (!record || !record.clinic_id || !record.threshold_percentage) {
      throw new Error("Invalid notification record");
    }

    logStep("Processing notification", { 
      clinicId: record.clinic_id, 
      threshold: record.threshold_percentage 
    });

    // Invoke the send-consult-limit-notification function
    const { error: invokeError } = await supabaseClient.functions.invoke(
      'send-consult-limit-notification',
      {
        body: {
          clinicId: record.clinic_id,
          threshold: record.threshold_percentage,
          consultsUsed: record.consults_at_notification,
          consultsCap: record.consults_cap,
        },
      }
    );

    if (invokeError) {
      logStep("Error invoking email function", { error: invokeError.message });
      throw invokeError;
    }

    logStep("Notification triggered successfully");

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});