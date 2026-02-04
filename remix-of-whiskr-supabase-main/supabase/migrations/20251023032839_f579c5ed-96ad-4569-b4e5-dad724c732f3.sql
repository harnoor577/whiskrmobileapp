-- Fix search_path security issues for patient ID functions

-- Update get_patient_identifier function with secure search_path
CREATE OR REPLACE FUNCTION public.get_patient_identifier(identifiers jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(identifiers->>'patient_id', '');
$$;

-- Update check_duplicate_patient_id function with secure search_path
CREATE OR REPLACE FUNCTION public.check_duplicate_patient_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  patient_id_value text;
  duplicate_count integer;
BEGIN
  -- Extract patient_id from identifiers
  patient_id_value := NEW.identifiers->>'patient_id';
  
  -- Only check if patient_id is provided
  IF patient_id_value IS NOT NULL AND patient_id_value != '' THEN
    -- Check for existing patient with same patient_id in same clinic (excluding self if updating)
    SELECT COUNT(*) INTO duplicate_count
    FROM public.patients
    WHERE clinic_id = NEW.clinic_id
      AND identifiers->>'patient_id' = patient_id_value
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    
    IF duplicate_count > 0 THEN
      RAISE EXCEPTION 'Patient ID "%" already exists in this clinic', patient_id_value;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update find_duplicate_patient_ids function with secure search_path
CREATE OR REPLACE FUNCTION public.find_duplicate_patient_ids(clinic_uuid uuid DEFAULT NULL)
RETURNS TABLE (
  clinic_id uuid,
  patient_id text,
  duplicate_count bigint,
  patient_ids uuid[]
)
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