import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@whiskr.ai";

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { ticketId } = await req.json();

    // Fetch ticket details
    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select(`
        *,
        profiles!support_tickets_user_id_fkey(name, email),
        clinics(name)
      `)
      .eq("id", ticketId)
      .maybeSingle();

    if (ticketError) {
      throw new Error(`Database error: ${ticketError.message}`);
    }
    
    if (!ticket) {
      throw new Error(`No support ticket found with ID: ${ticketId}`);
    }

    // Send email to master admin via Resend API
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `whiskr Support <${fromEmail}>`,
        to: ["support@whiskr.ai"],
        subject: `New Support Ticket: ${ticket.subject}`,
        html: `
          <h2>New Support Ticket Received</h2>
          <p><strong>From:</strong> ${ticket.profiles?.name} (${ticket.profiles?.email})</p>
          <p><strong>Clinic:</strong> ${ticket.clinics?.name}</p>
          <p><strong>Priority:</strong> ${ticket.priority}</p>
          <p><strong>Subject:</strong> ${ticket.subject}</p>
          <div style="margin-top: 20px; padding: 15px; background-color: #f5f5f5; border-left: 4px solid #1E40AF;">
            <p><strong>Description:</strong></p>
            <p>${ticket.description.replace(/\n/g, '<br>')}</p>
          </div>
        `
      })
    });

    console.log("Support notification sent:", await emailResponse.json());

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Error sending support notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});