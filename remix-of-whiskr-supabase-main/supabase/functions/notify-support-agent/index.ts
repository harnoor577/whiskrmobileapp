import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// HTML escape function to prevent HTML injection in emails
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

interface NotifySupportAgentRequest {
  agentEmail: string;
  agentName: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is super admin
    const { data: superAdminCheck } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .maybeSingle();

    if (!superAdminCheck) {
      return new Response(JSON.stringify({ error: "Only super admins can notify support agents" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { agentEmail, agentName }: NotifySupportAgentRequest = await req.json();

    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@whiskr.ai";
    const appUrl = Deno.env.get("VITE_REFERRAL_BASE_URL") || "https://whiskr.ai";

    // Send email using Resend API
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `whiskr Support <${fromEmail}>`,
        to: [agentEmail],
        subject: "You've been added as a Support Agent - whiskr",
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1E40AF;">Welcome to the whiskr Support Team!</h1>
          <p>Hi ${escapeHtml(agentName)},</p>
          <p>You have been added as a support agent for whiskr. You can now access the support management system to help our users.</p>
          
          <h2 style="color: #1E40AF;">What you can do:</h2>
          <ul>
            <li>View and manage support tickets</li>
            <li>Reply to user inquiries</li>
            <li>Resolve and close support tickets</li>
          </ul>
          
          <div style="margin: 30px 0;">
            <a href="${appUrl}/support-management" 
               style="background-color: #1E40AF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Access Support Dashboard
            </a>
          </div>
          
          <p>If you haven't created an account yet, please sign up using this email address (${escapeHtml(agentEmail)}).</p>
          
          <p style="color: #666; font-size: 14px; margin-top: 40px;">
            If you have any questions, please contact the administrator who added you.
          </p>
          
          <p>Best regards,<br>The whiskr Team</p>
        </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      throw new Error(`Resend API error: ${errorText}`);
    }

    const emailData = await emailResponse.json();

    console.log("Support agent notification email sent:", emailData);

    return new Response(JSON.stringify({ success: true, emailResponse: emailData }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in notify-support-agent function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);