import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Use hardcoded base URL instead of constructing from request
const APP_BASE_URL = "https://whiskr.ai";

// Input validation schema
const invitationEmailSchema = z.object({
  email: z.string().email().max(255),
  clinicName: z.string().min(1).max(200),
  inviterName: z.string().min(1).max(200),
  role: z.string().min(1).max(50),
  invitationId: z.string().uuid(),
});

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Require authentication - only authenticated users can send invitations
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required", code: "AUTH_REQUIRED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired authentication token", code: "AUTH_INVALID" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate and parse input
    const body = await req.json();
    const validationResult = invitationEmailSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error("[SEND-INVITATION-EMAIL] Validation error:", validationResult.error.errors);
      return new Response(
        JSON.stringify({ error: "Invalid input", code: "VALIDATION_ERROR" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, clinicName, inviterName, role, invitationId } = validationResult.data;
    
    // Use hardcoded base URL for security - prevents URL manipulation attacks
    const signupUrl = `${APP_BASE_URL}/signup?invitation=${invitationId}`;

    // Escape HTML entities in user-provided content to prevent XSS
    const escapeHtml = (str: string): string => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const safeClinicName = escapeHtml(clinicName);
    const safeInviterName = escapeHtml(inviterName);
    const safeRole = escapeHtml(role);

    const emailResponse = await resend.emails.send({
      from: `whiskr <${Deno.env.get("RESEND_FROM_EMAIL") || "noreply@whiskr.ai"}>`,
      to: [email],
      subject: `You've been invited to join ${safeClinicName} on whiskr`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
              .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
              .button { display: inline-block; background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
              .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
              .badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: capitalize; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">🐾 You're Invited!</h1>
              </div>
              <div class="content">
                <p>Hi there!</p>
                <p><strong>${safeInviterName}</strong> has invited you to join <strong>${safeClinicName}</strong> on whiskr as a <span class="badge">${safeRole}</span>.</p>
                
                <p>whiskr is a HIPAA/PIPEDA-compliant clinical copilot that helps veterinary teams with:</p>
                <ul>
                  <li>Real-time voice transcription during consultations</li>
                  <li>AI-generated SOAP notes</li>
                  <li>Intelligent patient history summaries</li>
                  <li>Task management and collaboration</li>
                </ul>
                
                <div style="text-align: center;">
                  <a href="${signupUrl}" class="button">Accept Invitation &amp; Sign Up</a>
                </div>
                
                <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                  This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
                </p>
              </div>
              <div class="footer">
                <p>© 2025 whiskr - HIPAA &amp; PIPEDA Compliant<br>
                Secure veterinary practice management</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    console.log("[SEND-INVITATION-EMAIL] Email sent successfully to:", email);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("[SEND-INVITATION-EMAIL] Error:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred sending the invitation", code: "INTERNAL_ERROR" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
