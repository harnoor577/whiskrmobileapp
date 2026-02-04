-- Fix Function Search Path (4 functions)

-- Fix verify_master_admin_backup_code
CREATE OR REPLACE FUNCTION public.verify_master_admin_backup_code(p_email text, p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid BOOLEAN := false;
BEGIN
  UPDATE public.master_admin_backup_codes
  SET used = true, used_at = now()
  WHERE email = p_email
    AND code = p_code
    AND NOT used
  RETURNING true INTO v_valid;
  
  RETURN COALESCE(v_valid, false);
END;
$$;

-- Fix generate_master_admin_backup_codes
CREATE OR REPLACE FUNCTION public.generate_master_admin_backup_codes(p_email text)
RETURNS TABLE(code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.master_admin_backup_codes
  WHERE email = p_email AND NOT used;
  
  RETURN QUERY
  INSERT INTO public.master_admin_backup_codes (email, code)
  SELECT 
    p_email,
    substring(md5(random()::text || clock_timestamp()::text) from 1 for 12)
  FROM generate_series(1, 10)
  RETURNING master_admin_backup_codes.code;
END;
$$;

-- Fix verify_master_admin_otp
CREATE OR REPLACE FUNCTION public.verify_master_admin_otp(p_email text, p_otp text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid BOOLEAN := false;
BEGIN
  UPDATE public.master_admin_otps
  SET used = true, used_at = now()
  WHERE email = p_email
    AND otp_code = p_otp
    AND NOT used
    AND expires_at > now()
  RETURNING true INTO v_valid;
  
  RETURN COALESCE(v_valid, false);
END;
$$;

-- Fix cleanup_expired_otps
CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.master_admin_otps
  WHERE expires_at < now() - interval '1 hour';
END;
$$;

-- Fix RLS Policies (8 policies) - Replace "always true" with restrictive policies
-- Service role bypasses RLS, so edge functions will still work

-- master_admin_backup_codes
DROP POLICY IF EXISTS "Allow system to insert backup codes" ON public.master_admin_backup_codes;
DROP POLICY IF EXISTS "Allow system to update backup codes" ON public.master_admin_backup_codes;

CREATE POLICY "Service role only - backup codes insert"
ON public.master_admin_backup_codes FOR INSERT
WITH CHECK (false);

CREATE POLICY "Service role only - backup codes update"
ON public.master_admin_backup_codes FOR UPDATE
USING (false)
WITH CHECK (false);

-- master_admin_otps
DROP POLICY IF EXISTS "Allow system to insert OTPs" ON public.master_admin_otps;
DROP POLICY IF EXISTS "Allow system to update OTPs" ON public.master_admin_otps;

CREATE POLICY "Service role only - otps insert"
ON public.master_admin_otps FOR INSERT
WITH CHECK (false);

CREATE POLICY "Service role only - otps update"
ON public.master_admin_otps FOR UPDATE
USING (false)
WITH CHECK (false);

-- rate_limit_attempts
DROP POLICY IF EXISTS "System can manage rate limits" ON public.rate_limit_attempts;

CREATE POLICY "Service role only - rate limits"
ON public.rate_limit_attempts FOR ALL
USING (false)
WITH CHECK (false);

-- referrals
DROP POLICY IF EXISTS "System can create referrals" ON public.referrals;
DROP POLICY IF EXISTS "System can update referrals" ON public.referrals;

CREATE POLICY "Service role only - referrals insert"
ON public.referrals FOR INSERT
WITH CHECK (false);

CREATE POLICY "Service role only - referrals update"
ON public.referrals FOR UPDATE
USING (false)
WITH CHECK (false);

-- user_credits (check if policy exists first)
DROP POLICY IF EXISTS "System can award credits" ON public.user_credits;

CREATE POLICY "Service role only - credits insert"
ON public.user_credits FOR INSERT
WITH CHECK (false);