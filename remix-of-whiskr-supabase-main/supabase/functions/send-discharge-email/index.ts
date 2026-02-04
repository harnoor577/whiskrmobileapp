import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PdfAttachment {
  filename: string;
  content: string; // base64 encoded PDF
}

interface SendDischargeEmailRequest {
  consultId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  attachments?: PdfAttachment[];
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(resendApiKey);

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestBody: SendDischargeEmailRequest = await req.json();
    const {
      consultId,
      recipientEmail,
      subject,
      body: emailBody,
      attachments,
    } = requestBody;

    // Validate required fields
    if (!consultId || !recipientEmail || !subject || !emailBody) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch consult and related data for verification and clinic info
    const { data: consultData, error: consultError } = await supabase
      .from("consults")
      .select(`
        id,
        clinic_id,
        patient_id
      `)
      .eq("id", consultId)
      .single();

    if (consultError || !consultData) {
      console.error("Error fetching consult:", consultError);
      return new Response(
        JSON.stringify({ success: false, error: "Consult not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch patient and clinic info separately
    const [patientResult, clinicResult] = await Promise.all([
      supabase.from("patients").select("name, species, breed").eq("id", consultData.patient_id).single(),
      supabase.from("clinics").select("name, clinic_email").eq("id", consultData.clinic_id).single(),
    ]);

    const patientName = patientResult.data?.name || "Patient";
    const clinicName = clinicResult.data?.name || "Your Veterinary Clinic";
    const clinicEmail = clinicResult.data?.clinic_email;

    // Build HTML email content
    let htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #0D9488 0%, #0F766E 100%); color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
    .content { background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 16px; font-weight: 600; color: #0D9488; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #0D948820; }
    .section-content { white-space: pre-wrap; font-size: 14px; }
    .footer { background: #f9fafb; padding: 16px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px; color: #6b7280; }
    .footer a { color: #0D9488; text-decoration: none; }
    .disclaimer { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 12px; margin-top: 24px; font-size: 12px; color: #92400e; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${clinicName}</h1>
      <p>Discharge Summary for ${patientName}</p>
    </div>
    <div class="content">
      <div class="section">
        <div class="section-title">Visit Summary</div>
        <div class="section-content">${escapeHtml(emailBody)}</div>
      </div>`;

    htmlContent += `
      <div class="disclaimer">
        <strong>Important Notice:</strong> This information is provided for educational purposes and should not replace professional veterinary advice. If you have any concerns about your pet's health, please contact us immediately.
      </div>
    </div>
    <div class="footer">
      <p>Sent from ${clinicName}</p>
      <p>Powered by <a href="https://whiskr.ai">whiskr.ai</a></p>
    </div>
  </div>
</body>
</html>`;

    // Prepare email options with PDF attachments
    const emailOptions: {
      from: string;
      to: string[];
      subject: string;
      html: string;
      cc?: string[];
      attachments?: Array<{ filename: string; content: string }>;
    } = {
      from: "Whiskr <noreply@whiskr.ai>",
      to: [recipientEmail],
      subject: subject,
      html: htmlContent,
    };

    // Add clinic email as CC if available
    if (clinicEmail && clinicEmail !== recipientEmail) {
      emailOptions.cc = [clinicEmail];
    }

    // Add PDF attachments if provided - pass base64 directly to Resend
    if (attachments && attachments.length > 0) {
      console.log("[DISCHARGE-EMAIL] Attaching", attachments.length, "PDF(s)");
      attachments.forEach((att, i) => {
        console.log(`[DISCHARGE-EMAIL] Attachment ${i + 1}: ${att.filename}, base64 length: ${att.content.length}`);
      });
      
      emailOptions.attachments = attachments.map((att) => ({
        filename: att.filename,
        content: att.content, // Pass base64 string directly to Resend
      }));
    }

    // Send email via Resend
    const { data: emailResult, error: emailError } = await resend.emails.send(emailOptions);

    if (emailError) {
      console.error("Resend error:", emailError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Email sent successfully:", emailResult?.id);

    // Log the email send event for audit
    await supabase.from("audit_events").insert({
      clinic_id: consultData.clinic_id,
      user_id: user.id,
      action: "send_discharge_email",
      entity_type: "consult",
      entity_id: consultId,
      details: {
        recipient: recipientEmail,
        subject: subject,
        attachment_count: attachments?.length || 0,
        attachment_names: attachments?.map(a => a.filename) || [],
        email_id: emailResult?.id,
      },
    });

    return new Response(
      JSON.stringify({ success: true, emailId: emailResult?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-discharge-email:", error);
    return new Response(
      JSON.stringify({ success: false, error: "An error occurred processing your request" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper function to escape HTML special characters
function escapeHtml(text: string): string {
  const div = { text };
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\n/g, "<br>");
}
