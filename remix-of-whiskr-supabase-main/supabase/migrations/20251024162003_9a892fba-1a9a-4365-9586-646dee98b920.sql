-- Fix security definer functions to set search_path
-- This prevents search_path manipulation attacks

-- Update has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Update has_clinic_role function
CREATE OR REPLACE FUNCTION public.has_clinic_role(_user_id uuid, _clinic_id uuid, _role clinic_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_roles
    WHERE user_id = _user_id
      AND clinic_id = _clinic_id
      AND role = _role
  )
$$;

-- Update can_edit_clinical_data function
CREATE OR REPLACE FUNCTION public.can_edit_clinical_data(_user_id uuid, _clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_roles
    WHERE user_id = _user_id
      AND clinic_id = _clinic_id
      AND role IN ('vet'::clinic_role, 'vet_tech'::clinic_role)
  )
$$;

-- Update can_add_user function
CREATE OR REPLACE FUNCTION public.can_add_user(clinic_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT COUNT(*) FROM public.profiles WHERE clinic_id = clinic_uuid
  ) < (
    SELECT max_users FROM public.clinics WHERE id = clinic_uuid
  );
$$;

-- Update is_trial_expired function
CREATE OR REPLACE FUNCTION public.is_trial_expired(clinic_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN subscription_status = 'trial' AND trial_ends_at < now() THEN true
      ELSE false
    END
  FROM public.clinics 
  WHERE id = clinic_uuid;
$$;

-- Update has_reached_consult_cap function
CREATE OR REPLACE FUNCTION public.has_reached_consult_cap(clinic_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN subscription_tier = 'enterprise' THEN false
      WHEN subscription_status = 'trial' THEN consults_used_this_period >= trial_consults_cap
      ELSE consults_used_this_period >= consults_cap
    END
  FROM public.clinics 
  WHERE id = clinic_uuid;
$$;

-- Update get_user_clinic_id function
CREATE OR REPLACE FUNCTION public.get_user_clinic_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Update get_current_user_email function
CREATE OR REPLACE FUNCTION public.get_current_user_email()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Update get_user_total_credits function
CREATE OR REPLACE FUNCTION public.get_user_total_credits(user_uuid uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount), 0) FROM public.user_credits WHERE user_id = user_uuid;
$$;

-- Update get_patient_identifier function
CREATE OR REPLACE FUNCTION public.get_patient_identifier(identifiers jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(identifiers->>'patient_id', '');
$$;

-- Update find_duplicate_patient_ids function
CREATE OR REPLACE FUNCTION public.find_duplicate_patient_ids(clinic_uuid uuid DEFAULT NULL)
RETURNS TABLE(clinic_id uuid, patient_id text, duplicate_count bigint, patient_ids uuid[])
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.clinic_id,
    p.identifiers->>'patient_id' as patient_id,
    COUNT(*) as duplicate_count,
    ARRAY_AGG(p.id) as patient_ids
  FROM public.patients p
  WHERE (p.identifiers->>'patient_id') IS NOT NULL
    AND (p.identifiers->>'patient_id') != ''
    AND (clinic_uuid IS NULL OR p.clinic_id = clinic_uuid)
  GROUP BY p.clinic_id, p.identifiers->>'patient_id'
  HAVING COUNT(*) > 1
  ORDER BY duplicate_count DESC;
$$;

-- Create new function to check if email requires MFA (replaces hardcoded client check)
CREATE OR REPLACE FUNCTION public.check_requires_mfa(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles p
    JOIN public.user_roles ur ON p.user_id = ur.user_id
    WHERE LOWER(p.email) = LOWER(p_email)
      AND ur.role = 'super_admin'::app_role
  );
$$;