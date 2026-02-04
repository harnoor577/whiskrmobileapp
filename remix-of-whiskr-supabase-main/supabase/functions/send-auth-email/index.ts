import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Admin client (server key) to generate recovery links
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AuthEmailRequest {
  email: string;
  token?: string;
  type: 'signup' | 'recovery' | 'invite';
  origin?: string; // front-end origin to build redirect
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, token, type, origin }: AuthEmailRequest = await req.json();

    // Always use production domain for white-label experience
    const appOrigin = origin || "https://whiskr.ai";

    let redirectUrl = "";
    let buttonText = "Confirm Email";

    let subject = "Confirm your email";
    let heading = "Confirm your email address";
    let message = "Click the button below to confirm your email address and get started with Whiskr.";

  if (type === 'recovery') {
    subject = "Reset your password";
    heading = "Reset your password";
    message = "Click the button below to reset your password. This link will expire in 1 hour.";
    buttonText = "Reset Password";

    console.log(`[RECOVERY] Generating recovery link for ${email} with appOrigin: ${appOrigin}`);

    // Generate a recovery link server-side so we fully control branding and flow
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: appOrigin ? { redirectTo: `${appOrigin}/reset-password` } : undefined,
    } as any);
    if (error) throw error;

    console.log(`[RECOVERY] Supabase generateLink response:`, data);

    const props: any = (data as any)?.properties || {};
    const emailOtp: string | undefined = props.email_otp;
    const hashed_token: string | undefined = props.hashed_token;

    // Create direct link to our app with the token parameters
    if (appOrigin && (emailOtp || hashed_token)) {
      if (hashed_token) {
        // Use token_hash for newer Supabase versions
        redirectUrl = `${appOrigin}/reset-password?token_hash=${encodeURIComponent(hashed_token)}&type=recovery`;
        console.log(`[RECOVERY] Using hashed_token, redirectUrl: ${redirectUrl}`);
      } else if (emailOtp) {
        // Use email_otp as token for older versions
        redirectUrl = `${appOrigin}/reset-password?token=${encodeURIComponent(emailOtp)}&email=${encodeURIComponent(email)}&type=recovery`;
        console.log(`[RECOVERY] Using emailOtp, redirectUrl: ${redirectUrl}`);
      }
    } else {
      // Fallback to action_link if tokens not available
      redirectUrl = props.action_link || (data as any)?.action_link || "";
      console.log(`[RECOVERY] Using fallback action_link, redirectUrl: ${redirectUrl}`);
    }
  } else if (type === 'invite') {
      subject = "You've been invited";
      heading = "Join your team";
      message = "You've been invited to join a clinic. Click below to accept the invitation.";
      buttonText = "Accept Invitation";
      redirectUrl = appOrigin ? `${appOrigin}` : '#';
    } else if (type === 'signup') {
      // For signup you likely already send a confirmation email elsewhere
      redirectUrl = appOrigin ? `${appOrigin}/dashboard` : '#';
      buttonText = "Confirm Email";
    }

    if (!redirectUrl) {
      throw new Error('Failed to generate recovery link.');
    }

    const emailResponse = await resend.emails.send({
      from: `Whiskr <${Deno.env.get("RESEND_FROM_EMAIL") || "noreply@whiskr.ai"}>`,
      to: [email],
      subject: subject,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 0;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">
                    <tr>
                      <td style="padding: 48px 48px 24px 48px; text-align: center; background: linear-gradient(135deg, #0d9488 0%, #2dd4bf 100%); border-radius: 12px 12px 0 0;">
                        <h1 style="color: #ffffff; font-size: 28px; margin: 0; font-weight: 700;">Whiskr</h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px 48px 24px 48px; text-align: center;">
                        <h2 style="color: #0d9488; font-size: 24px; margin: 0; font-weight: 600;">${heading}</h2>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 0 48px 36px 48px; color: #374151; font-size: 16px; line-height: 1.6; text-align: center;">
                        <p style="margin: 0;">${message}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 0 48px 48px 48px;" align="center">
                        <a href="${redirectUrl}" style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #2dd4bf 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(13, 148, 136, 0.3);">
                          ${buttonText}
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 24px 48px; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; text-align: center;">
                        <p style="margin: 0;">If you didn't request this email, you can safely ignore it.</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 24px 48px 40px 48px; color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.5;">
                        <p style="margin: 0;">© ${new Date().getFullYear()} Whiskr Inc.<br>28 Geary St, STE 650 #5268<br>San Francisco, CA 94108</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    console.log("Auth email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending auth email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);