import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RefundStatusEmailRequest {
  ticketId: string;
  newStatus: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticketId, newStatus }: RefundStatusEmailRequest = await req.json();

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get ticket details
    const { data: ticket, error: ticketError } = await supabaseClient
      .from('support_tickets')
      .select('*, payload')
      .eq('id', ticketId)
      .maybeSingle();

    if (ticketError) throw new Error(`Database error: ${ticketError.message}`);
    if (!ticket) throw new Error(`Ticket not found with ID: ${ticketId}`);

    // Get user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('name, email')
      .eq('user_id', ticket.user_id)
      .maybeSingle();

    if (profileError) throw new Error(`Database error: ${profileError.message}`);
    if (!profile) throw new Error(`User profile not found for user: ${ticket.user_id}`);

    const statusLabels: Record<string, string> = {
      under_review: 'Under Review',
      approved: 'Approved',
      declined: 'Declined',
      processed: 'Processed',
    };

    const statusLabel = statusLabels[newStatus] || newStatus;
    const amount = ticket.payload?.amount || 'N/A';
    const currency = ticket.payload?.currency || 'USD';
    const invoice = ticket.payload?.invoice || 'N/A';

    let emailContent = '';
    let emailSubject = '';

    switch (newStatus) {
      case 'under_review':
        emailSubject = `Refund Request #${ticketId.substring(0, 8)} - Under Review`;
        emailContent = `
          <h2>Your refund request is under review</h2>
          <p>Hi ${profile.name},</p>
          <p>We've received your refund request and our billing team is currently reviewing it.</p>
          <h3>Request Details:</h3>
          <ul>
            <li><strong>Ticket #:</strong> ${ticketId.substring(0, 8)}</li>
            <li><strong>Amount:</strong> ${currency} ${amount}</li>
            <li><strong>Invoice:</strong> ${invoice}</li>
          </ul>
          <p>We'll update you once our review is complete, typically within 2-3 business days.</p>
          <p>Thank you for your patience.</p>
        `;
        break;

      case 'approved':
        emailSubject = `Refund Request #${ticketId.substring(0, 8)} - Approved ✓`;
        emailContent = `
          <h2>Your refund request has been approved</h2>
          <p>Hi ${profile.name},</p>
          <p>Great news! Your refund request has been approved.</p>
          <h3>Approved Refund Details:</h3>
          <ul>
            <li><strong>Ticket #:</strong> ${ticketId.substring(0, 8)}</li>
            <li><strong>Amount:</strong> ${currency} ${amount}</li>
            <li><strong>Invoice:</strong> ${invoice}</li>
          </ul>
          <p>The refund will be processed shortly and you'll receive another notification once it's complete. Refunds typically appear in your account within 5-10 business days.</p>
          <p>Thank you for your patience throughout this process.</p>
        `;
        break;

      case 'declined':
        emailSubject = `Refund Request #${ticketId.substring(0, 8)} - Update`;
        emailContent = `
          <h2>Refund Request Status Update</h2>
          <p>Hi ${profile.name},</p>
          <p>We've completed our review of your refund request.</p>
          <h3>Request Details:</h3>
          <ul>
            <li><strong>Ticket #:</strong> ${ticketId.substring(0, 8)}</li>
            <li><strong>Amount:</strong> ${currency} ${amount}</li>
            <li><strong>Invoice:</strong> ${invoice}</li>
          </ul>
          <p>Unfortunately, we're unable to process this refund request as submitted. Our team has added details to your support ticket with more information.</p>
          <p>If you have any questions or would like to discuss alternative solutions, please reply to your support ticket and we'll be happy to help.</p>
        `;
        break;

      case 'processed':
        emailSubject = `Refund #${ticketId.substring(0, 8)} - Processed Successfully`;
        emailContent = `
          <h2>Your refund has been processed</h2>
          <p>Hi ${profile.name},</p>
          <p>Your refund has been successfully processed and sent to your original payment method.</p>
          <h3>Refund Details:</h3>
          <ul>
            <li><strong>Ticket #:</strong> ${ticketId.substring(0, 8)}</li>
            <li><strong>Amount:</strong> ${currency} ${amount}</li>
            <li><strong>Invoice:</strong> ${invoice}</li>
          </ul>
          <p>Please allow 5-10 business days for the refund to appear in your account, depending on your financial institution.</p>
          <p>Thank you for being a valued customer. If you have any questions, please don't hesitate to reach out.</p>
        `;
        break;

      default:
        throw new Error(`Unknown status: ${newStatus}`);
    }

    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@whiskr.ai";

    const emailResponse = await resend.emails.send({
      from: `whiskr <${fromEmail}>`,
      to: [profile.email],
      subject: emailSubject,
      html: emailContent,
    });

    console.log("Refund status email sent:", emailResponse);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-refund-status-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
