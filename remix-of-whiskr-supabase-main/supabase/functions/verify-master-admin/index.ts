import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { checkRateLimit, recordAttempt, clearRateLimit } from '../_shared/rateLimiter.ts';
import { sanitizeValidationError } from '../_shared/errorHandler.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Input validation schema
const verifySchema = z.object({
  email: z.string().email().max(255),
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits").optional(),
  backupCode: z.string().length(12).toUpperCase().optional(),
}).refine(data => data.otp || data.backupCode, {
  message: "Either OTP or backup code must be provided",
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Validate input
    const body = await req.json();
    const validationResult = verifySchema.safeParse(body);
    
    if (!validationResult.success) {
      const sanitized = sanitizeValidationError(validationResult.error.errors.map(e => ({
        path: e.path.map(String),
        message: e.message,
      })));
      return new Response(
        JSON.stringify(sanitized),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    const { email, otp, backupCode } = validationResult.data;
    const action = otp ? 'otp_verify' : 'backup_verify';

    // Check rate limit and lockout status
    const rateLimit = await checkRateLimit(supabase, email, action, {
      maxAttempts: 5,
      windowMinutes: 15,
      enableLockout: true,
    });

    if (!rateLimit.allowed) {
      if (rateLimit.lockedUntil) {
        // Account is locked
        return new Response(
          JSON.stringify({ 
            error: rateLimit.lockoutReason || 'Account temporarily locked',
            lockedUntil: rateLimit.lockedUntil.toISOString(),
            valid: false,
          }),
          {
            status: 423, // Locked
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      } else {
        // Rate limited but not locked
        return new Response(
          JSON.stringify({ 
            error: 'Too many verification attempts',
            retryAfter: rateLimit.retryAfter?.toISOString(),
            remaining: 0,
            valid: false,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': Math.ceil((rateLimit.retryAfter!.getTime() - Date.now()) / 1000).toString(),
              ...corsHeaders,
            },
          }
        );
      }
    }

    let isValid = false;

    if (otp) {
      // Verify OTP
      const { data, error } = await supabase.rpc('verify_master_admin_otp', {
        p_email: email,
        p_otp: otp,
      });

      if (error) {
        throw error;
      }

      isValid = data === true;
    } else if (backupCode) {
      // Verify backup code
      const { data, error } = await supabase.rpc('verify_master_admin_backup_code', {
        p_email: email,
        p_code: backupCode.toUpperCase(),
      });

      if (error) {
        throw error;
      }

      isValid = data === true;
    }

    if (!isValid) {
      // Record failed attempt
      await recordAttempt(supabase, email, action, 15);
    } else {
      // Clear rate limit on successful verification
      await clearRateLimit(supabase, email, action);
    }

    return new Response(
      JSON.stringify({ valid: isValid }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error('[VERIFY-MASTER-ADMIN] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'An error occurred during verification',
        code: 'VERIFICATION_ERROR'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
});
