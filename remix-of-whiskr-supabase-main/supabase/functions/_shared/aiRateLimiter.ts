// Use 'any' type for SupabaseClient to avoid version mismatches between edge functions
import { checkRateLimit, recordAttempt, RateLimitResult } from './rateLimiter.ts';

/**
 * Rate limits for AI edge functions.
 * Limits are per user per hour to prevent abuse while allowing normal usage.
 */
export const AI_RATE_LIMITS: Record<string, { maxAttempts: number; windowMinutes: number }> = {
  // High-frequency chat functions
  'chat_assistant': { maxAttempts: 200, windowMinutes: 60 },
  'rewrite_text': { maxAttempts: 200, windowMinutes: 60 },
  
  // Transcription - limited by audio processing time
  'transcribe_audio': { maxAttempts: 100, windowMinutes: 60 },
  
  // Document analysis - more expensive operations
  'analyze_document': { maxAttempts: 50, windowMinutes: 60 },
  'analyze_recording': { maxAttempts: 50, windowMinutes: 60 },
  
  // SOAP generation - moderate usage expected
  'generate_soap': { maxAttempts: 100, windowMinutes: 60 },
  'generate_procedure': { maxAttempts: 100, windowMinutes: 60 },
  'generate_wellness': { maxAttempts: 100, windowMinutes: 60 },
  'generate_summary': { maxAttempts: 100, windowMinutes: 60 },
  
  // Client-facing content generation
  'generate_client_education': { maxAttempts: 100, windowMinutes: 60 },
  'generate_client_email': { maxAttempts: 100, windowMinutes: 60 },
  'generate_discharge_plan': { maxAttempts: 100, windowMinutes: 60 },
  'generate_procedure_email': { maxAttempts: 100, windowMinutes: 60 },
};

export interface AIRateLimitResult extends RateLimitResult {
  action: string;
}

/**
 * Check if a user has exceeded their AI rate limit for a specific function
 */
export async function checkAIRateLimit(
  supabase: any,
  userId: string,
  functionName: string
): Promise<AIRateLimitResult> {
  const config = AI_RATE_LIMITS[functionName];
  
  if (!config) {
    console.warn(`[AI Rate Limiter] No config found for function: ${functionName}, using defaults`);
    // Default to a generous limit if function not explicitly configured
    const defaultConfig = { maxAttempts: 100, windowMinutes: 60 };
    const result = await checkRateLimit(supabase, userId, functionName, defaultConfig);
    return { ...result, action: functionName };
  }
  
  const result = await checkRateLimit(supabase, userId, functionName, config);
  return { ...result, action: functionName };
}

/**
 * Record a successful AI function call for rate limiting
 */
export async function recordAIAttempt(
  supabase: any,
  userId: string,
  functionName: string
): Promise<void> {
  const config = AI_RATE_LIMITS[functionName] || { windowMinutes: 60 };
  await recordAttempt(supabase, userId, functionName, config.windowMinutes);
}

/**
 * Create a 429 rate limit response with standard headers
 */
export function createRateLimitResponse(
  result: AIRateLimitResult,
  corsHeaders: Record<string, string>
): Response {
  const retryAfter = result.retryAfter 
    ? Math.ceil((result.retryAfter.getTime() - Date.now()) / 1000)
    : 3600; // Default 1 hour

  return new Response(
    JSON.stringify({
      error: 'Rate limit exceeded. Please wait before making more requests.',
      retryAfter: retryAfter,
      remaining: result.remaining,
      action: result.action,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
      },
    }
  );
}

/**
 * Utility function for edge functions to wrap rate limiting logic
 * Returns null if allowed, or a Response if rate limited
 */
export async function withAIRateLimit(
  supabase: any,
  userId: string,
  functionName: string,
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  const rateLimitResult = await checkAIRateLimit(supabase, userId, functionName);
  
  if (!rateLimitResult.allowed) {
    console.log(`[AI Rate Limiter] User ${userId} rate limited for ${functionName}`, {
      remaining: rateLimitResult.remaining,
      retryAfter: rateLimitResult.retryAfter,
    });
    return createRateLimitResponse(rateLimitResult, corsHeaders);
  }
  
  // Record the attempt
  await recordAIAttempt(supabase, userId, functionName);
  
  console.log(`[AI Rate Limiter] User ${userId} allowed for ${functionName}`, {
    remaining: rateLimitResult.remaining,
  });
  
  return null;
}
