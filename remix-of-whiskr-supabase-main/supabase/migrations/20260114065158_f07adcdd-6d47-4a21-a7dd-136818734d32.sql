-- Fix infinite recursion in RLS policies between consults and consult_assignments
-- Step 1: Add clinic_id column to consult_assignments
ALTER TABLE public.consult_assignments 
ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);

-- Step 2: Populate clinic_id from existing consults
UPDATE public.consult_assignments ca
SET clinic_id = c.clinic_id
FROM public.consults c
WHERE ca.consult_id = c.id
AND ca.clinic_id IS NULL;

-- Step 3: Make column NOT NULL after population
ALTER TABLE public.consult_assignments 
ALTER COLUMN clinic_id SET NOT NULL;

-- Step 4: Drop problematic RLS policies that cause circular reference
DROP POLICY IF EXISTS "Users can view assignments in their clinic" ON public.consult_assignments;
DROP POLICY IF EXISTS "Staff with edit permissions can assign users" ON public.consult_assignments;
DROP POLICY IF EXISTS "Staff with edit permissions can remove assignments" ON public.consult_assignments;

-- Step 5: Create new RLS policies without circular reference (using profiles directly)
CREATE POLICY "Users can view assignments in their clinic"
ON public.consult_assignments
FOR SELECT
USING (
  clinic_id IN (
    SELECT profiles.clinic_id 
    FROM profiles 
    WHERE profiles.user_id = auth.uid()
  )
);

CREATE POLICY "Staff with edit permissions can assign users"
ON public.consult_assignments
FOR INSERT
WITH CHECK (
  clinic_id IN (
    SELECT profiles.clinic_id 
    FROM profiles 
    WHERE profiles.user_id = auth.uid()
  )
  AND can_edit_clinical_data(auth.uid(), clinic_id)
);

CREATE POLICY "Staff with edit permissions can remove assignments"
ON public.consult_assignments
FOR DELETE
USING (
  clinic_id IN (
    SELECT profiles.clinic_id 
    FROM profiles 
    WHERE profiles.user_id = auth.uid()
  )
  AND can_edit_clinical_data(auth.uid(), clinic_id)
);

-- Step 6: Create function to auto-set clinic_id from consult on insert
CREATE OR REPLACE FUNCTION set_consult_assignment_clinic_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.clinic_id IS NULL THEN
    SELECT clinic_id INTO NEW.clinic_id
    FROM consults
    WHERE id = NEW.consult_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 7: Create trigger to auto-populate clinic_id
DROP TRIGGER IF EXISTS set_clinic_id_before_insert ON public.consult_assignments;
CREATE TRIGGER set_clinic_id_before_insert
BEFORE INSERT ON public.consult_assignments
FOR EACH ROW
EXECUTE FUNCTION set_consult_assignment_clinic_id();

-- Step 8: Add index for performance
CREATE INDEX IF NOT EXISTS idx_consult_assignments_clinic_id 
ON public.consult_assignments(clinic_id);