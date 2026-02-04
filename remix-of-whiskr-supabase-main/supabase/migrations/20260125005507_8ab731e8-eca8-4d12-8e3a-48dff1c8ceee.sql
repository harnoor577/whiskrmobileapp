-- ============================================================================
-- PART 8: SECURITY FUNCTIONS
-- ============================================================================

-- Check if user has app-level role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if user has clinic-level role
CREATE OR REPLACE FUNCTION public.has_clinic_role(_user_id UUID, _clinic_id UUID, _role clinic_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_roles
    WHERE user_id = _user_id
      AND clinic_id = _clinic_id
      AND role = _role
  )
$$;

-- Check if user can edit clinical data (vet or vet_tech)
CREATE OR REPLACE FUNCTION public.can_edit_clinical_data(_user_id UUID, _clinic_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_roles
    WHERE user_id = _user_id
      AND clinic_id = _clinic_id
      AND role IN ('vet'::clinic_role, 'vet_tech'::clinic_role)
  )
$$;

-- Get user's clinic ID
CREATE OR REPLACE FUNCTION public.get_user_clinic_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Get current user email
CREATE OR REPLACE FUNCTION public.get_current_user_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Count active devices for clinic
CREATE OR REPLACE FUNCTION public.count_active_devices(_clinic_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT device_fingerprint)::integer
  FROM public.device_sessions
  WHERE clinic_id = _clinic_id
    AND NOT revoked
    AND last_active_at > now() - interval '7 days';
$$;

-- Count active devices for user
CREATE OR REPLACE FUNCTION public.count_user_active_devices(_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.device_sessions
  WHERE user_id = _user_id
    AND NOT revoked
    AND last_active_at > now() - interval '7 days';
$$;

-- Check if trial expired
CREATE OR REPLACE FUNCTION public.is_trial_expired(clinic_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
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

-- Check if consult cap reached
CREATE OR REPLACE FUNCTION public.has_reached_consult_cap(clinic_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
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

-- Check if clinic can add more users
CREATE OR REPLACE FUNCTION public.can_add_user(clinic_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT COUNT(*) FROM public.profiles WHERE clinic_id = clinic_uuid
  ) < (
    SELECT max_users FROM public.clinics WHERE id = clinic_uuid
  );
$$;

-- Get user total credits
CREATE OR REPLACE FUNCTION public.get_user_total_credits(user_uuid UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount), 0) FROM public.user_credits WHERE user_id = user_uuid;
$$;

-- Get patient identifier from JSONB
CREATE OR REPLACE FUNCTION public.get_patient_identifier(identifiers JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(identifiers->>'patient_id', '');
$$;

-- Check if master admin requires MFA
CREATE OR REPLACE FUNCTION public.check_requires_mfa(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
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

-- Verify master admin OTP
CREATE OR REPLACE FUNCTION public.verify_master_admin_otp(p_email TEXT, p_otp TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Verify master admin backup code
CREATE OR REPLACE FUNCTION public.verify_master_admin_backup_code(p_email TEXT, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Generate master admin backup codes
CREATE OR REPLACE FUNCTION public.generate_master_admin_backup_codes(p_email TEXT)
RETURNS TABLE(code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Super admin functions for trial/consult management
CREATE OR REPLACE FUNCTION public.add_trial_days(clinic_uuid UUID, days_to_add INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super admins can add trial days';
  END IF;
  
  UPDATE public.clinics
  SET trial_ends_at = COALESCE(trial_ends_at, now()) + (days_to_add || ' days')::interval
  WHERE id = clinic_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_complimentary_trial(clinic_uuid UUID, trial_days INTEGER DEFAULT 30)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super admins can grant complimentary trials';
  END IF;
  
  UPDATE public.clinics
  SET 
    subscription_status = 'trial',
    trial_ends_at = now() + (trial_days || ' days')::interval,
    complimentary_trial_granted = true,
    complimentary_trial_granted_by = auth.uid(),
    complimentary_trial_granted_at = now()
  WHERE id = clinic_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_consults_to_cap(clinic_uuid UUID, additional_consults INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super admins can add consults';
  END IF;
  
  UPDATE public.clinics
  SET 
    trial_consults_cap = CASE 
      WHEN subscription_status = 'trial' THEN trial_consults_cap + additional_consults
      ELSE trial_consults_cap
    END,
    consults_cap = CASE 
      WHEN subscription_status != 'trial' THEN consults_cap + additional_consults
      ELSE consults_cap
    END
  WHERE id = clinic_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_master_admin_account(p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super admins can unlock accounts';
  END IF;

  UPDATE public.rate_limit_attempts
  SET locked_until = NULL,
      lockout_reason = NULL,
      lockout_level = 0
  WHERE identifier = p_email
    AND locked_until > NOW();
END;
$$;

-- Grant super admin to specific email
CREATE OR REPLACE FUNCTION public.grant_super_admin_to_email(email_address TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  SELECT user_id INTO target_user_id
  FROM public.profiles
  WHERE email = email_address
  LIMIT 1;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', email_address;
  END IF;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'super_admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Delete consult cascade
CREATE OR REPLACE FUNCTION public.delete_consult_cascade(_consult_id UUID, _clinic_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.consults c
    WHERE c.id = _consult_id 
    AND c.clinic_id = _clinic_id
    AND c.clinic_id IN (
      SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Consult not found or access denied';
  END IF;

  DELETE FROM public.chat_messages WHERE consult_id = _consult_id;
  DELETE FROM public.consults WHERE id = _consult_id;
  
  INSERT INTO public.audit_events (clinic_id, user_id, action, entity_type, entity_id, details)
  VALUES (
    _clinic_id,
    auth.uid(),
    'delete',
    'consult',
    _consult_id,
    jsonb_build_object('deleted_at', now())
  );
END;
$$;

-- Delete patient cascade
CREATE OR REPLACE FUNCTION public.delete_patient_cascade(_patient_id UUID, _clinic_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = _patient_id 
    AND p.clinic_id = _clinic_id
    AND p.clinic_id IN (
      SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Patient not found or access denied';
  END IF;

  DELETE FROM public.chat_messages 
  WHERE consult_id IN (
    SELECT id FROM public.consults WHERE patient_id = _patient_id
  );
  
  DELETE FROM public.consults WHERE patient_id = _patient_id;
  DELETE FROM public.patients WHERE id = _patient_id;
  
  INSERT INTO public.audit_events (clinic_id, user_id, action, entity_type, entity_id, details)
  VALUES (
    _clinic_id,
    auth.uid(),
    'delete',
    'patient',
    _patient_id,
    jsonb_build_object('deleted_at', now())
  );
END;
$$;

-- Find duplicate patient IDs
CREATE OR REPLACE FUNCTION public.find_duplicate_patient_ids(clinic_uuid UUID DEFAULT NULL)
RETURNS TABLE(clinic_id UUID, patient_id TEXT, duplicate_count BIGINT, patient_ids UUID[])
LANGUAGE sql
STABLE
SECURITY DEFINER
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

-- Cleanup functions
CREATE OR REPLACE FUNCTION public.cleanup_stale_devices()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.device_sessions
  SET revoked = true,
      revoked_at = now()
  WHERE last_active_at < now() - interval '30 days'
    AND NOT revoked;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.master_admin_otps
  WHERE expires_at < now() - interval '1 hour';
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limit_attempts
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$;