import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: Date;
  lockedUntil?: Date;
  lockoutReason?: string;
}

export interface RateLimitConfig {
  maxAttempts: number;
  windowMinutes: number;
  enableLockout?: boolean;
  lockoutLevels?: {
    attempts: number;
    durationMinutes: number;
    reason: string;
  }[];
}

const DEFAULT_LOCKOUT_LEVELS = [
  { attempts: 5, durationMinutes: 15, reason: 'Too many failed attempts' },
  { attempts: 10, durationMinutes: 60, reason: 'Excessive failed attempts' },
  { attempts: 20, durationMinutes: 1440, reason: 'Account locked for 24 hours due to suspicious activity' },
];

/**
 * Check rate limit for a given identifier and action
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  identifier: string,
  action: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - config.windowMinutes * 60 * 1000);

  // Check if account is currently locked
  const { data: lockCheck } = await supabase
    .from('rate_limit_attempts')
    .select('locked_until, lockout_reason')
    .eq('identifier', identifier)
    .eq('action', action)
    .not('locked_until', 'is', null)
    .gte('locked_until', new Date().toISOString())
    .maybeSingle();

  if (lockCheck) {
    return {
      allowed: false,
      remaining: 0,
      lockedUntil: new Date(lockCheck.locked_until),
      lockoutReason: lockCheck.lockout_reason || 'Account temporarily locked',
    };
  }

  // Check current attempt count within window
  const { data: attempts } = await supabase
    .from('rate_limit_attempts')
    .select('attempt_count, window_start, lockout_level')
    .eq('identifier', identifier)
    .eq('action', action)
    .gte('window_start', windowStart.toISOString())
    .order('window_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentCount = attempts?.attempt_count || 0;

  if (currentCount >= config.maxAttempts) {
    // Check if we should apply lockout
    if (config.enableLockout) {
      const lockoutLevels = config.lockoutLevels || DEFAULT_LOCKOUT_LEVELS;
      const currentLevel = attempts?.lockout_level || 0;
      
      // Find next lockout level
      const nextLockout = lockoutLevels.find(l => l.attempts <= currentCount + 1);
      if (nextLockout && currentLevel < lockoutLevels.length) {
        const lockedUntil = new Date(Date.now() + nextLockout.durationMinutes * 60 * 1000);
        
        // Apply lockout
        await supabase
          .from('rate_limit_attempts')
          .upsert({
            identifier,
            action,
            attempt_count: currentCount + 1,
            window_start: attempts?.window_start || new Date().toISOString(),
            locked_until: lockedUntil.toISOString(),
            lockout_reason: nextLockout.reason,
            lockout_level: currentLevel + 1,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'identifier,action' });

        return {
          allowed: false,
          remaining: 0,
          lockedUntil,
          lockoutReason: nextLockout.reason,
        };
      }
    }

    const retryAfter = new Date(new Date(attempts?.window_start || Date.now()).getTime() + config.windowMinutes * 60 * 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfter,
    };
  }

  return {
    allowed: true,
    remaining: config.maxAttempts - currentCount - 1,
  };
}

/**
 * Record a new attempt
 */
export async function recordAttempt(
  supabase: SupabaseClient,
  identifier: string,
  action: string,
  windowMinutes: number
): Promise<void> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  // Get or create current window record
  const { data: existing } = await supabase
    .from('rate_limit_attempts')
    .select('*')
    .eq('identifier', identifier)
    .eq('action', action)
    .gte('window_start', windowStart.toISOString())
    .order('window_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Increment existing record
    await supabase
      .from('rate_limit_attempts')
      .update({
        attempt_count: existing.attempt_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    // Create new record
    await supabase
      .from('rate_limit_attempts')
      .insert({
        identifier,
        action,
        attempt_count: 1,
        window_start: new Date().toISOString(),
      });
  }
}

/**
 * Clear rate limit (e.g., after successful authentication)
 */
export async function clearRateLimit(
  supabase: SupabaseClient,
  identifier: string,
  action: string
): Promise<void> {
  await supabase
    .from('rate_limit_attempts')
    .delete()
    .eq('identifier', identifier)
    .eq('action', action);
}

/**
 * Extract IP address from request
 */
export function getClientIP(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
         req.headers.get('x-real-ip') ||
         'unknown';
}
