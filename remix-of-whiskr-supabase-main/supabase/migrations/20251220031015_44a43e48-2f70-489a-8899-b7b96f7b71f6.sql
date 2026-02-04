-- Remove overly permissive RLS policies that allow any user to manipulate security-critical tables

-- 1. Remove permissive policy from rate_limit_attempts
-- This table should only be accessible via service role (Edge Functions)
DROP POLICY IF EXISTS "System can manage rate limits" ON public.rate_limit_attempts;

-- 2. Remove permissive INSERT/UPDATE policies from master_admin_otps
-- These policies allow any authenticated user to insert/update OTPs which is a security risk
DROP POLICY IF EXISTS "Allow system to insert OTPs" ON public.master_admin_otps;
DROP POLICY IF EXISTS "Allow system to update OTPs" ON public.master_admin_otps;

-- 3. Remove permissive INSERT/UPDATE policies from master_admin_backup_codes
-- These policies allow any authenticated user to insert/update backup codes which is a security risk
DROP POLICY IF EXISTS "Allow system to insert backup codes" ON public.master_admin_backup_codes;
DROP POLICY IF EXISTS "Allow system to update backup codes" ON public.master_admin_backup_codes;