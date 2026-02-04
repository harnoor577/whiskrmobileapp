-- Create table for master admin OTP codes
CREATE TABLE IF NOT EXISTS public.master_admin_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ
);

-- Create index for quick lookup
CREATE INDEX idx_master_admin_otps_email_code ON public.master_admin_otps(email, otp_code) WHERE NOT used;

-- Create table for master admin backup codes
CREATE TABLE IF NOT EXISTS public.master_admin_backup_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ
);

-- Create index for backup codes
CREATE INDEX idx_master_admin_backup_codes_email ON public.master_admin_backup_codes(email) WHERE NOT used;

-- RLS Policies (super restrictive - only authenticated master admin can access)
ALTER TABLE public.master_admin_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_admin_backup_codes ENABLE ROW LEVEL SECURITY;

-- Only super admins can view OTPs
CREATE POLICY "Super admins can view OTPs"
  ON public.master_admin_otps
  FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Only super admins can view backup codes
CREATE POLICY "Super admins can view backup codes"
  ON public.master_admin_backup_codes
  FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Function to verify OTP
CREATE OR REPLACE FUNCTION public.verify_master_admin_otp(
  p_email TEXT,
  p_otp TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_valid BOOLEAN := false;
BEGIN
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

-- Function to verify backup code
CREATE OR REPLACE FUNCTION public.verify_master_admin_backup_code(
  p_email TEXT,
  p_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_valid BOOLEAN := false;
BEGIN
  -- Check if backup code exists and is not used
  UPDATE public.master_admin_backup_codes
  SET used = true, used_at = now()
  WHERE email = p_email
    AND code = p_code
    AND NOT used
  RETURNING true INTO v_valid;
  
  RETURN COALESCE(v_valid, false);
END;
$$;

-- Function to generate backup codes
CREATE OR REPLACE FUNCTION public.generate_master_admin_backup_codes(
  p_email TEXT
)
RETURNS TABLE(code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete existing unused backup codes for this email
  DELETE FROM public.master_admin_backup_codes
  WHERE email = p_email AND NOT used;
  
  -- Generate 10 new backup codes
  RETURN QUERY
  INSERT INTO public.master_admin_backup_codes (email, code)
  SELECT 
    p_email,
    substring(md5(random()::text || clock_timestamp()::text) from 1 for 12)
  FROM generate_series(1, 10)
  RETURNING master_admin_backup_codes.code;
END;
$$;

-- Cleanup function to remove expired OTPs (run periodically)
CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.master_admin_otps
  WHERE expires_at < now() - interval '1 hour';
END;
$$;