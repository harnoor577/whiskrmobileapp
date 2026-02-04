import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TreatmentPlanRequest {
  consultId: string;
  recipientEmail: string;
  emailContent?: string;
  format?: 'default' | 'template';
  templateId?: string;
  visitType?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { consultId, recipientEmail, emailContent, format = 'default', templateId, visitType }: TreatmentPlanRequest = await req.json();

    // Fetch consult with patient and clinic details
    const { data: consult, error: consultError } = await supabase
      .from('consults')
      .select(`
        *,
        patient:patients(*),
        clinic:clinics(name, phone, address, clinic_email, logo_url)
      `)
      .eq('id', consultId)
      .single();

    if (consultError || !consult) {
      throw new Error("Consult not found");
    }

    // Fetch vet name separately if available
    let vetName = null;
    if (consult.vet_user_id) {
      const { data: vetProfile } = await supabase
        .from('profiles')
        .select('name')
        .eq('user_id', consult.vet_user_id)
        .single();
      vetName = vetProfile?.name;
    }

    // Check if this is a procedure email
    const isProcedure = visitType === 'procedure';
    
    // For procedures, use the specialized procedure email generator
    if (isProcedure) {
      try {
        const { data: procData, error: procError } = await supabase.functions.invoke('generate-procedure-email', {
          body: {
            consultId,
            recipientEmail,
            vetName,
            clinicInfo: consult.clinic
          }
        });
        
        if (procError) throw procError;
        
        if (procData?.emailBody && procData?.subjectLine) {
          // Send the procedure email
        const emailResponse = await resend.emails.send({
            from: `whiskr <${Deno.env.get("RESEND_FROM_EMAIL") || "noreply@whiskr.ai"}>`,
            to: [recipientEmail],
            cc: consult.clinic?.clinic_email ? [consult.clinic.clinic_email] : undefined,
            subject: procData.subjectLine,
            text: procData.emailBody,
            html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="utf-8">
                  <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px; }
                    .email-body { white-space: pre-wrap; }
                  </style>
                </head>
                <body>
                  <div class="email-body">${procData.emailBody.replace(/\n/g, '<br>')}</div>
                </body>
              </html>
            `,
          });
          
          console.log("Procedure email sent successfully:", emailResponse);
          
          return new Response(JSON.stringify({ success: true, emailResponse, type: 'procedure' }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      } catch (e) {
        console.error("Error with procedure email generation:", e);
        // Fall through to standard email if procedure email fails
      }
    }

    // Standard treatment plan email (non-procedure)
    let summary = consult.final_summary || "";
    if (!emailContent && !summary) {
      try {
        const { data: genData, error: genError } = await supabase.functions.invoke('generate-summary', {
          body: { consultId }
        });
        if (!genError && genData?.summary) {
          summary = genData.summary as string;
        }
      } catch (e) {
        console.error("Error invoking generate-summary:", e);
      }
    }

    if (!summary) {
      summary = "Summary not available";
    }

    // Derive age from available text if DOB isn't set
    const ageFromSummaryMatch = (() => {
      const text = [summary, (consult.reason_for_visit as string) || '', (consult.soap_s as string) || ''].join(' ');
      const m = text.match(/(\d{1,2})-year-old/);
      return m ? parseInt(m[1], 10) : null;
    })();

    // Build email HTML in classic format with optional summary
    const summaryBlock = summary && summary !== 'Summary not available' 
      ? `
          <div class="section">
            <div class="section-title">SUMMARY</div>
            <pre>${summary}</pre>
          </div>
        `
      : '';

    let htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
            .header { border-bottom: 3px solid #1e3a8a; padding-bottom: 20px; margin-bottom: 30px; }
            .clinic-name { color: #1e3a8a; font-size: 24px; font-weight: bold; margin: 0; }
            .section { margin-bottom: 25px; }
            .section-title { background-color: #f3f4f6; padding: 8px 12px; font-weight: bold; color: #1e3a8a; border-left: 4px solid #1e3a8a; margin-bottom: 10px; }
            .patient-info { display: grid; grid-template-columns: 150px auto; gap: 8px; }
            .label { font-weight: bold; color: #4b5563; }
            pre { white-space: pre-wrap; word-wrap: break-word; background-color: #f9fafb; padding: 12px; border-radius: 4px; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
            .disclaimer { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="clinic-name">${consult.clinic?.name || 'Veterinary Clinic'}</h1>
            ${consult.clinic?.address ? `<p style="margin: 5px 0;">${consult.clinic.address}</p>` : ''}
            ${consult.clinic?.phone ? `<p style="margin: 5px 0;">Phone: ${consult.clinic.phone}</p>` : ''}
            ${consult.clinic?.clinic_email ? `<p style="margin: 5px 0;">Email: ${consult.clinic.clinic_email}</p>` : ''}
          </div>

          <div class="section">
            <div class="section-title">PATIENT INFORMATION</div>
            <div class="patient-info">
              <span class="label">Patient Name:</span><span>${consult.patient?.name || 'N/A'}</span>
              <span class="label">Species:</span><span>${consult.patient?.species || 'N/A'}</span>
              ${consult.patient?.breed ? `<span class="label">Breed:</span><span>${consult.patient.breed}</span>` : ''}
              ${consult.patient?.date_of_birth ? (() => {
                const birthDate = new Date(consult.patient.date_of_birth);
                const today = new Date();
                const age = Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                return `<span class="label">Age:</span><span>${age} years</span>`;
              })() : (ageFromSummaryMatch ? `<span class="label">Age:</span><span>${ageFromSummaryMatch} years</span>` : '')}
              <span class="label">Consultation Date:</span><span>${new Date(consult.started_at).toLocaleDateString()}</span>
              ${vetName ? `<span class="label">Veterinarian:</span><span>${vetName}</span>` : ''}
            </div>
          </div>

          ${consult.reason_for_visit ? `
          <div class="section">
            <div class="section-title">REASON FOR VISIT</div>
            <pre>${consult.reason_for_visit}</pre>
          </div>
          ` : ''}

          ${summaryBlock}

          ${consult.soap_a ? `
          <div class="section">
            <div class="section-title">DIAGNOSIS</div>
            <pre>${consult.soap_a}</pre>
          </div>
          ` : ''}

          ${consult.soap_p || consult.final_treatment_plan ? `
          <div class="section">
            <div class="section-title">TREATMENT PLAN</div>
            <pre>${consult.final_treatment_plan || consult.soap_p}</pre>
          </div>
          ` : ''}

          <div class="disclaimer">
            <strong>⚠️ Important Notice:</strong> This document is for educational and informational purposes only. 
            It does not constitute medical advice, diagnosis, or treatment. Always consult with a licensed veterinarian 
            for specific medical advice regarding your pet.
          </div>

          <div class="footer">
            <p><strong>whiskr</strong><br>
            Generated by whiskr.ai<br>
            28 Geary St, STE 650 #5268, San Francisco, CA 94108<br>
            Email: support@whiskr.ai</p>
            <p style="margin-top: 10px;"><em>This is an automated document. Please verify all information with your veterinarian.</em></p>
          </div>
        </body>
      </html>
    `;

    // Send email via Resend with CC to clinic email if available
    const ccEmails = consult.clinic?.clinic_email ? [consult.clinic.clinic_email] : undefined;
    const emailResponse = await resend.emails.send({
      from: `whiskr <${Deno.env.get("RESEND_FROM_EMAIL") || "noreply@whiskr.ai"}>`,
      to: [recipientEmail],
      cc: ccEmails,
      subject: `Treatment Plan - ${consult.patient?.name || 'Patient'}`,
      html: htmlContent,
    });

    // Persist final plan/summary if not already locked
    if (!consult.final_treatment_plan || !consult.plan_locked) {
      const finalSummary = summary && summary !== 'Summary not available' ? summary : consult.final_summary || null;
      const finalPlan = consult.final_treatment_plan || consult.soap_p || null;
      await supabase
        .from('consults')
        .update({ final_summary: finalSummary, final_treatment_plan: finalPlan, plan_locked: true })
        .eq('id', consultId);
    }

    console.log("Treatment plan email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending treatment plan:", error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
