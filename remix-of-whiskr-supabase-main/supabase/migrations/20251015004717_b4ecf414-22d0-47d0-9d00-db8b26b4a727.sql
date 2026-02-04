-- Fix 1: Harden has_role function with empty search_path
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Fix 2: Create atomic deletion functions for patients and consults
CREATE OR REPLACE FUNCTION public.delete_consult_cascade(_consult_id uuid, _clinic_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION public.delete_patient_cascade(_patient_id uuid, _clinic_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  consult_record RECORD;
BEGIN
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

-- Fix 3: Add INSERT policy for audit_events
CREATE POLICY "Users can create audit events"
ON public.audit_events
FOR INSERT
TO authenticated
WITH CHECK (
  clinic_id IN (
    SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
  )
  AND user_id = auth.uid()
);