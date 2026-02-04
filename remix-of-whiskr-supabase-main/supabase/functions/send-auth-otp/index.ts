import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { checkRateLimit, recordAttempt, getClientIP } from '../_shared/rateLimiter.ts';
import { sanitizeValidationError } from '../_shared/errorHandler.ts';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const otpRequestSchema = z.object({
  email: z.string().email().max(255),
  otp: z.string().regex(/^\d{6}$/, "OTP must be exactly 6 digits"),
  isTest: z.boolean().optional().default(false),
});

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Validate input
    const body = await req.json();
    const validationResult = otpRequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      const sanitized = sanitizeValidationError(validationResult.error.errors.map(e => ({
        path: e.path.map(String),
        message: e.message,
      })));
      return new Response(
        JSON.stringify(sanitized),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const { email, otp, isTest } = validationResult.data;
    const clientIP = getClientIP(req);

    // Lightweight IP-based rate limiting only: Max 20 OTP sends per IP per hour
    // This prevents mass spam but doesn't block legitimate repeated attempts
    const ipRateLimit = await checkRateLimit(supabase, clientIP, 'otp_send_ip', {
      maxAttempts: 20,
      windowMinutes: 60,
    });

    if (!ipRateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Too many requests from this IP address. Please try again later.',
          retryAfter: ipRateLimit.retryAfter?.toISOString(),
        }),
        {
          status: 429,
          headers: { 
            "Content-Type": "application/json",
            "Retry-After": Math.ceil((ipRateLimit.retryAfter!.getTime() - Date.now()) / 1000).toString(),
            ...corsHeaders 
          },
        }
      );
    }

    // Record IP attempt (no per-email rate limiting on sends)
    await recordAttempt(supabase, clientIP, 'otp_send_ip', 60);

    // Store OTP in database (unless it's a test)
    if (!isTest) {
      const { error: dbError } = await supabase
        .from('master_admin_otps')
        .insert({
          email,
          otp_code: otp,
        });

      if (dbError) {
        throw new Error(`Failed to store OTP: ${dbError.message}`);
      }
    }

    // Prepare email HTML once so we can reuse for fallback
    const emailHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .container {
                background-color: #f8f9fa;
                border-radius: 8px;
                padding: 30px;
                margin: 20px 0;
              }
              .header {
                text-align: center;
                margin-bottom: 30px;
              }
              .otp-code {
                background-color: #fff;
                border: 2px solid #2563eb;
                border-radius: 8px;
                padding: 20px;
                text-align: center;
                font-size: 32px;
                font-weight: bold;
                letter-spacing: 8px;
                color: #2563eb;
                margin: 30px 0;
              }
              .warning {
                background-color: #fef2f2;
                border-left: 4px solid #ef4444;
                padding: 15px;
                margin: 20px 0;
                border-radius: 4px;
              }
              .footer {
                text-align: center;
                margin-top: 30px;
                font-size: 14px;
                color: #6b7280;
              }
              ${isTest ? '.test-badge { background-color: #fbbf24; color: #000; padding: 5px 10px; border-radius: 4px; display: inline-block; margin-bottom: 20px; }' : ''}
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                ${isTest ? '<div class="test-badge">⚠️ TEST EMAIL - NOT FOR PRODUCTION</div>' : ''}
                <h1 style="color: #1f2937; margin: 0;">Master Admin Login Verification</h1>
              </div>
              
              <p>A login attempt was made to your Master Admin account.</p>
              
              <p><strong>Your verification code is:</strong></p>
              
              <div class="otp-code">${otp}</div>
              
              <p>Enter this code on the login page to complete your authentication. This code will expire in <strong>10 minutes</strong>.</p>
              
              <div class="warning">
                <strong>⚠️ Security Alert:</strong> If you did not attempt to log in, someone may be trying to access your account. Please secure your password immediately and contact support.
              </div>
              
              <p style="margin-top: 30px;">
                <strong>Security Tips:</strong>
              </p>
              <ul>
                <li>Never share this code with anyone</li>
                <li>whiskr will never ask for your verification code</li>
                <li>This code can only be used once</li>
              </ul>
              
              <div class="footer">
                <p>whiskr - Secure Veterinary Practice Management</p>
                \${isTest ? '<p style="color: #ef4444; font-weight: bold;">This is a TEST email. OTP system is not yet active.</p>' : ''}
              </div>
            </div>
          </body>
        </html>
      `;

    // Send with new domain
    const subject = isTest ? "[TEST] Master Admin Login Verification" : "Master Admin Login Verification";
    const emailResponse = await resend.emails.send({
      from: `whiskr <${Deno.env.get("RESEND_FROM_EMAIL") || "noreply@whiskr.ai"}>`,
      to: [email],
      subject,
      html: emailHtml,
    });

    return new Response(
      JSON.stringify({ success: true, messageId: emailResponse.data?.id }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error('[SEND-AUTH-OTP] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'An error occurred sending OTP',
        code: 'OTP_SEND_ERROR'
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
