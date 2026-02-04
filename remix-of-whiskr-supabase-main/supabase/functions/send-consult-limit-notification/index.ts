import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-CONSULT-LIMIT-NOTIFICATION] ${step}${detailsStr}`);
};

interface NotificationRequest {
  clinicId: string;
  threshold: 80 | 95;
  consultsUsed: number;
  consultsCap: number;
}

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

    const { clinicId, threshold, consultsUsed, consultsCap }: NotificationRequest = await req.json();
    logStep("Received notification request", { clinicId, threshold, consultsUsed, consultsCap });

    // Get clinic details
    const { data: clinicData, error: clinicError } = await supabaseClient
      .from('clinics')
      .select('name')
      .eq('id', clinicId)
      .single();

    if (clinicError || !clinicData) {
      logStep("Error fetching clinic", { error: clinicError?.message });
      throw new Error(`Failed to fetch clinic: ${clinicError?.message || 'Clinic not found'}`);
    }

    // First get admin user_ids from user_roles
    const { data: adminRoles, error: rolesError } = await supabaseClient
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (rolesError) {
      logStep("Error fetching admin roles", { error: rolesError.message });
    }

    const adminUserIds = adminRoles?.map(r => r.user_id) || [];
    logStep("Found admin user IDs", { count: adminUserIds.length });

    // Get profiles for admins in this clinic
    let adminProfiles: { email: string; name: string }[] = [];
    if (adminUserIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabaseClient
        .from('profiles')
        .select('email, name')
        .eq('clinic_id', clinicId)
        .in('user_id', adminUserIds);

      if (profilesError) {
        logStep("Error fetching admin profiles", { error: profilesError.message });
      } else {
        adminProfiles = profiles || [];
      }
    }

    // If no admins found, fall back to all users in the clinic
    let adminEmails: string[];
    let adminName: string;

    if (!adminProfiles || adminProfiles.length === 0) {
      logStep("No admin roles found, falling back to all clinic users", { clinicId });
      
      const { data: allProfiles, error: fallbackError } = await supabaseClient
        .from('profiles')
        .select('email, name')
        .eq('clinic_id', clinicId);

      if (fallbackError || !allProfiles || allProfiles.length === 0) {
        logStep("No profiles found for clinic", { clinicId });
        throw new Error("No users found for clinic");
      }

      adminEmails = allProfiles.map(p => p.email);
      adminName = allProfiles[0].name;
      logStep("Using all clinic users as fallback", { count: adminEmails.length });
    } else {
      adminEmails = adminProfiles.map(p => p.email);
      adminName = adminProfiles[0].name;
      logStep("Found admin emails", { count: adminEmails.length });
    }

    const percentage = Math.round((consultsUsed / consultsCap) * 100);
    const remaining = consultsCap - consultsUsed;

    // Create email content based on threshold
    const subject = threshold === 80 
      ? `⚠️ ${clinicData.name}: ${percentage}% of Monthly Consults Used`
      : `🚨 ${clinicData.name}: ${percentage}% of Monthly Consults Used - Action Required`;

    const urgencyColor = threshold === 80 ? "#F59E0B" : "#DC2626";
    const urgencyText = threshold === 80 
      ? "You're approaching your monthly consult limit"
      : "You're very close to your monthly consult limit";

    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@whiskr.ai";

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Consult Limit Notification</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #2C4554 0%, #1a2930 100%); padding: 40px 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">whiskr</h1>
                      <p style="color: #F8F5F1; margin: 10px 0 0 0; font-size: 14px;">Consult Usage Alert</p>
                    </td>
                  </tr>
                  
                  <!-- Alert Banner -->
                  <tr>
                    <td style="background-color: ${urgencyColor}; padding: 20px 30px; text-align: center;">
                      <p style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 600;">${urgencyText}</p>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="color: #333333; font-size: 16px; line-height: 24px; margin: 0 0 20px 0;">
                        Hi ${adminName},
                      </p>
                      
                      <p style="color: #333333; font-size: 16px; line-height: 24px; margin: 0 0 30px 0;">
                        Your clinic <strong>${clinicData.name}</strong> has used <strong>${percentage}%</strong> of your monthly consult allocation.
                      </p>
                      
                      <!-- Usage Stats -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                        <tr>
                          <td style="text-align: center; padding: 10px;">
                            <p style="color: #666666; font-size: 14px; margin: 0 0 5px 0;">Consults Used</p>
                            <p style="color: #2C4554; font-size: 32px; font-weight: 700; margin: 0;">${consultsUsed}</p>
                          </td>
                          <td style="text-align: center; padding: 10px;">
                            <p style="color: #666666; font-size: 14px; margin: 0 0 5px 0;">Total Limit</p>
                            <p style="color: #2C4554; font-size: 32px; font-weight: 700; margin: 0;">${consultsCap}</p>
                          </td>
                          <td style="text-align: center; padding: 10px;">
                            <p style="color: #666666; font-size: 14px; margin: 0 0 5px 0;">Remaining</p>
                            <p style="color: ${remaining <= 5 ? '#DC2626' : '#059669'}; font-size: 32px; font-weight: 700; margin: 0;">${remaining}</p>
                          </td>
                        </tr>
                      </table>
                      
                      ${threshold === 95 ? `
                        <div style="background-color: #FEF2F2; border-left: 4px solid #DC2626; padding: 15px; margin-bottom: 30px; border-radius: 4px;">
                          <p style="color: #991B1B; font-size: 14px; margin: 0; line-height: 20px;">
                            <strong>Important:</strong> Once you reach your limit, you'll have a grace period of 5 additional consults to prevent workflow disruption. After that, you'll need to upgrade your plan to create more consults.
                          </p>
                        </div>
                      ` : ''}
                      
                      <p style="color: #333333; font-size: 16px; line-height: 24px; margin: 0 0 30px 0;">
                        To avoid any interruption to your workflow, we recommend upgrading your plan to a higher tier with more consults per month.
                      </p>
                      
                      <!-- CTA Button -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center">
                            <a href="${Deno.env.get('VITE_SUPABASE_URL')?.replace('/rest/v1', '') || 'https://app.ouravet.ai'}/billing" 
                               style="display: inline-block; background-color: #2C4554; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
                              Upgrade Your Plan
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0;">
                        Questions? Contact us at support@whiskr.ai
                      </p>
                      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        © \${new Date().getFullYear()} whiskr. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    // Send email to all admins
    const emailPromises = adminEmails.map(email => 
      resend.emails.send({
        from: fromEmail,
        to: [email],
        subject: subject,
        html: htmlContent,
      })
    );

    const results = await Promise.allSettled(emailPromises);
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logStep("Email sending completed", { successful, failed, total: adminEmails.length });

    if (failed > 0) {
      const errors = results
        .filter(r => r.status === 'rejected')
        .map((r: any) => r.reason?.message || 'Unknown error');
      logStep("Some emails failed", { errors });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: successful,
        failed: failed,
        total: adminEmails.length 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message, stack: error.stack });
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});