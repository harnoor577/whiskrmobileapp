-- Fix storage bucket policies to add proper clinic-scoping
-- This prevents cross-clinic access to diagnostic images (HIPAA/PIPEDA compliance)

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can view diagnostic images in their clinic" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload diagnostic images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update diagnostic images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete diagnostic images" ON storage.objects;

-- Create new clinic-scoped SELECT policy
CREATE POLICY "Users can view diagnostic images in their clinic"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'diagnostic-images' AND
  auth.uid() IS NOT NULL AND
  (
    -- Check if user belongs to the same clinic as the file owner
    -- File path format: {clinic_id}/{file_id}.{ext}
    (storage.foldername(name))[1] IN (
      SELECT clinic_id::text FROM public.profiles WHERE user_id = auth.uid()
    ) OR
    -- Allow super admins to access all files
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
);

-- Create new clinic-scoped INSERT policy
CREATE POLICY "Users can upload diagnostic images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'diagnostic-images' AND
  auth.uid() IS NOT NULL AND
  -- User can only upload to their clinic's folder
  (storage.foldername(name))[1] IN (
    SELECT clinic_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Create new clinic-scoped UPDATE policy
CREATE POLICY "Users can update diagnostic images"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'diagnostic-images' AND
  auth.uid() IS NOT NULL AND
  (
    (storage.foldername(name))[1] IN (
      SELECT clinic_id::text FROM public.profiles WHERE user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
);

-- Create new clinic-scoped DELETE policy
CREATE POLICY "Users can delete diagnostic images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'diagnostic-images' AND
  auth.uid() IS NOT NULL AND
  (
    (storage.foldername(name))[1] IN (
      SELECT clinic_id::text FROM public.profiles WHERE user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
);

-- Add search_path to SECURITY DEFINER functions that are missing it
-- This prevents potential search_path manipulation attacks

-- Fix functions that don't have explicit search_path set
CREATE OR REPLACE FUNCTION public.grant_super_admin_to_specific_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Check if the new user's email is bbal@growdvm.com
  IF NEW.email = 'bbal@growdvm.com' THEN
    -- Insert super_admin role if it doesn't exist
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_master_admin_otp(p_email text, p_otp text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.verify_master_admin_backup_code(p_email text, p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.generate_master_admin_backup_codes(p_email text)
RETURNS TABLE(code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  DELETE FROM public.master_admin_otps
  WHERE expires_at < now() - interval '1 hour';
END;
$function$;