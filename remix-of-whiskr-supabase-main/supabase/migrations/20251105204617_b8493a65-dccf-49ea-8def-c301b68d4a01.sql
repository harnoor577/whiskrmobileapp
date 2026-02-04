-- First, update the patients table policies to allow vet_tech and vet roles to manage patients

-- Drop existing restrictive policies and recreate with vet_tech and vet support
DROP POLICY IF EXISTS "Receptionists can manage patients" ON public.patients;
DROP POLICY IF EXISTS "Staff with edit permissions can manage patients" ON public.patients;

-- Allow receptionists, vet_tech, and vet to manage patients
CREATE POLICY "Clinical staff can manage patients"
ON public.patients
FOR ALL
TO authenticated
USING (
  (clinic_id IN (
    SELECT profiles.clinic_id
    FROM profiles
    WHERE profiles.user_id = auth.uid()
  )) 
  AND (
    EXISTS (
      SELECT 1
      FROM clinic_roles
      WHERE clinic_roles.user_id = auth.uid()
        AND clinic_roles.clinic_id = patients.clinic_id
        AND clinic_roles.role IN ('receptionist', 'vet_tech', 'vet')
    )
    OR can_edit_clinical_data(auth.uid(), clinic_id)
  )
)
WITH CHECK (
  (clinic_id IN (
    SELECT profiles.clinic_id
    FROM profiles
    WHERE profiles.user_id = auth.uid()
  )) 
  AND (
    EXISTS (
      SELECT 1
      FROM clinic_roles
      WHERE clinic_roles.user_id = auth.uid()
        AND clinic_roles.clinic_id = patients.clinic_id
        AND clinic_roles.role IN ('receptionist', 'vet_tech', 'vet')
    )
    OR can_edit_clinical_data(auth.uid(), clinic_id)
  )
);

-- Now update consults policies

-- Drop the existing update policy for staff
DROP POLICY IF EXISTS "Staff with edit permissions can update consults" ON public.consults;

-- Create a function to validate vet tech updates
CREATE OR REPLACE FUNCTION validate_vet_tech_consult_update()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  is_vet_tech BOOLEAN;
BEGIN
  -- Check if user is a vet tech
  SELECT EXISTS (
    SELECT 1
    FROM clinic_roles
    WHERE user_id = auth.uid()
      AND clinic_id = NEW.clinic_id
      AND role = 'vet_tech'
  ) INTO is_vet_tech;

  -- If user is a vet tech, check that they're only updating vitals
  IF is_vet_tech THEN
    -- Check if any restricted fields are being modified
    IF (NEW.soap_o IS DISTINCT FROM OLD.soap_o AND NEW.soap_o IS NOT NULL) OR
       (NEW.soap_a IS DISTINCT FROM OLD.soap_a AND NEW.soap_a IS NOT NULL) OR
       (NEW.soap_p IS DISTINCT FROM OLD.soap_p AND NEW.soap_p IS NOT NULL) OR
       (NEW.final_treatment_plan IS DISTINCT FROM OLD.final_treatment_plan AND NEW.final_treatment_plan IS NOT NULL) THEN
      RAISE EXCEPTION 'Vet techs can only update vitals (weight). Physical exam, assessment, and treatment plans require DVM/Vet role.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for consult updates
DROP TRIGGER IF EXISTS enforce_vet_tech_restrictions ON public.consults;
CREATE TRIGGER enforce_vet_tech_restrictions
  BEFORE UPDATE ON public.consults
  FOR EACH ROW
  EXECUTE FUNCTION validate_vet_tech_consult_update();

-- Create single update policy for all clinical staff
CREATE POLICY "Clinical staff can update consults"
ON public.consults
FOR UPDATE
TO authenticated
USING (
  (clinic_id IN (
    SELECT profiles.clinic_id
    FROM profiles
    WHERE profiles.user_id = auth.uid()
  ))
  AND (
    EXISTS (
      SELECT 1
      FROM clinic_roles
      WHERE clinic_roles.user_id = auth.uid()
        AND clinic_roles.clinic_id = consults.clinic_id
        AND clinic_roles.role IN ('vet_tech', 'vet')
    )
    OR can_edit_clinical_data(auth.uid(), clinic_id)
  )
)
WITH CHECK (
  (clinic_id IN (
    SELECT profiles.clinic_id
    FROM profiles
    WHERE profiles.user_id = auth.uid()
  ))
  AND (
    EXISTS (
      SELECT 1
      FROM clinic_roles
      WHERE clinic_roles.user_id = auth.uid()
        AND clinic_roles.clinic_id = consults.clinic_id
        AND clinic_roles.role IN ('vet_tech', 'vet')
    )
    OR can_edit_clinical_data(auth.uid(), clinic_id)
  )
);