import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { checkRateLimit, recordAttempt } from '../_shared/rateLimiter.ts';
import { sanitizeValidationError } from '../_shared/errorHandler.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Input validation schema
const backupCodeSchema = z.object({
  email: z.string().email().max(255),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Validate input
    const body = await req.json();
    const validationResult = backupCodeSchema.safeParse(body);
    
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

    const { email } = validationResult.data;

    // Rate limiting: Max 2 backup code generations per 24 hours
    const rateLimit = await checkRateLimit(supabase, email, 'backup_generate', {
      maxAttempts: 2,
      windowMinutes: 1440, // 24 hours
    });

    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Backup codes can only be regenerated twice per day',
          retryAfter: rateLimit.retryAfter?.toISOString(),
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

    // Record this attempt
    await recordAttempt(supabase, email, 'backup_generate', 1440);

    // Generate 10 new backup codes
    const { data, error } = await supabase.rpc('generate_master_admin_backup_codes', {
      p_email: email,
    });

    if (error) {
      console.error('Error generating backup codes:', error);
      throw error;
    }

    // Convert to array of codes
    const codes = data.map((row: any) => row.code);

    return new Response(
      JSON.stringify({ codes }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
});
