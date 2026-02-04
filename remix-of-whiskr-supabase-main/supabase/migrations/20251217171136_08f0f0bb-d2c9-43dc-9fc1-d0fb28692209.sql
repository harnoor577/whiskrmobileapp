-- Create validation helper functions for defense-in-depth

-- Email format validation function
CREATE OR REPLACE FUNCTION public.validate_email_format(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  -- Check email format with regex and length limit
  RETURN p_email IS NOT NULL 
    AND p_email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    AND length(p_email) <= 255;
END;
$$;

-- OTP format validation function (6 digits)
CREATE OR REPLACE FUNCTION public.validate_otp_format(p_otp TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN p_otp IS NOT NULL AND p_otp ~ '^\d{6}$';
END;
$$;

-- Backup code format validation (12 alphanumeric characters)
CREATE OR REPLACE FUNCTION public.validate_backup_code_format(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN p_code IS NOT NULL 
    AND length(p_code) = 12
    AND p_code ~ '^[A-Za-z0-9]+$';
END;
$$;

-- Update check_requires_mfa to validate email input
CREATE OR REPLACE FUNCTION public.check_requires_mfa(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN NOT validate_email_format(p_email) THEN false
    ELSE EXISTS (
      SELECT 1 
      FROM public.profiles p
      JOIN public.user_roles ur ON p.user_id = ur.user_id
      WHERE LOWER(p.email) = LOWER(p_email)
        AND ur.role = 'super_admin'::app_role
    )
  END;
$$;

-- Update verify_master_admin_otp to validate inputs
CREATE OR REPLACE FUNCTION public.verify_master_admin_otp(p_email TEXT, p_otp TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid BOOLEAN := false;
BEGIN
  -- Validate inputs first
  IF NOT validate_email_format(p_email) THEN
    RETURN false;
  END IF;
  
  IF NOT validate_otp_format(p_otp) THEN
    RETURN false;
  END IF;

  -- Check if OTP exists, is not used, and not expired
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

-- Update verify_master_admin_backup_code to validate inputs
CREATE OR REPLACE FUNCTION public.verify_master_admin_backup_code(p_email TEXT, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid BOOLEAN := false;
BEGIN
  -- Validate inputs first
  IF NOT validate_email_format(p_email) THEN
    RETURN false;
  END IF;
  
  IF NOT validate_backup_code_format(p_code) THEN
    RETURN false;
  END IF;

  -- Check if backup code exists and is not used
  UPDATE public.master_admin_backup_codes
  SET used = true, used_at = now()
  WHERE email = p_email
    AND code = UPPER(p_code)
    AND NOT used
  RETURNING true INTO v_valid;
  
  RETURN COALESCE(v_valid, false);
END;
$$;

-- Update generate_master_admin_backup_codes to validate email input
CREATE OR REPLACE FUNCTION public.generate_master_admin_backup_codes(p_email TEXT)
RETURNS TABLE(code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate email format
  IF NOT validate_email_format(p_email) THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  -- Delete existing unused backup codes for this email
  DELETE FROM public.master_admin_backup_codes
  WHERE email = p_email AND NOT used;
  
  -- Generate 10 new backup codes
  RETURN QUERY
  INSERT INTO public.master_admin_backup_codes (email, code)
  SELECT 
    p_email,
    UPPER(substring(md5(random()::text || clock_timestamp()::text) from 1 for 12))
  FROM generate_series(1, 10)
  RETURNING master_admin_backup_codes.code;
END;
$$;