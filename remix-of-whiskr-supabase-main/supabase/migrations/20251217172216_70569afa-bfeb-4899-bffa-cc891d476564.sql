-- Add explicit auth.uid() IS NULL checks to SECURITY DEFINER functions
-- This provides defense-in-depth against authentication bypass scenarios

-- 1. Update delete_consult_cascade with explicit auth check at entry
CREATE OR REPLACE FUNCTION public.delete_consult_cascade(_consult_id UUID, _clinic_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Explicit authentication check at function entry
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Validate ownership
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

  -- Delete chat messages first
  DELETE FROM public.chat_messages WHERE consult_id = _consult_id;
  
  -- Delete the consult
  DELETE FROM public.consults WHERE id = _consult_id;
  
  -- Log audit event
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

-- 2. Update delete_patient_cascade with explicit auth check at entry
CREATE OR REPLACE FUNCTION public.delete_patient_cascade(_patient_id UUID, _clinic_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  consult_record RECORD;
BEGIN
  -- Explicit authentication check at function entry
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Validate ownership
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

  -- Delete all chat messages for all consults of this patient
  DELETE FROM public.chat_messages 
  WHERE consult_id IN (
    SELECT id FROM public.consults WHERE patient_id = _patient_id
  );
  
  -- Delete all consults for this patient
  DELETE FROM public.consults WHERE patient_id = _patient_id;
  
  -- Delete the patient
  DELETE FROM public.patients WHERE id = _patient_id;
  
  -- Log audit event
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

-- 3. Update find_duplicate_patient_ids to restrict non-super-admins to their own clinic
CREATE OR REPLACE FUNCTION public.find_duplicate_patient_ids(clinic_uuid UUID DEFAULT NULL)
RETURNS TABLE (
  clinic_id UUID,
  patient_id TEXT,
  duplicate_count BIGINT,
  patient_ids UUID[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  effective_clinic_id UUID;
BEGIN
  -- Explicit authentication check at function entry
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Non-super-admins can only query their own clinic
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    -- Force clinic_uuid to user's own clinic
    SELECT p.clinic_id INTO effective_clinic_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
    LIMIT 1;
    
    IF effective_clinic_id IS NULL THEN
      RAISE EXCEPTION 'Profile not found';
    END IF;
  ELSE
    -- Super admins can query any clinic or all clinics
    effective_clinic_id := clinic_uuid;
  END IF;

  RETURN QUERY
  SELECT 
    p.clinic_id,
    p.identifiers->>'patient_id' as patient_id,
    COUNT(*) as duplicate_count,
    ARRAY_AGG(p.id) as patient_ids
  FROM public.patients p
  WHERE (p.identifiers->>'patient_id') IS NOT NULL
    AND (p.identifiers->>'patient_id') != ''
    AND (effective_clinic_id IS NULL OR p.clinic_id = effective_clinic_id)
  GROUP BY p.clinic_id, p.identifiers->>'patient_id'
  HAVING COUNT(*) > 1
  ORDER BY duplicate_count DESC;
END;
$$;