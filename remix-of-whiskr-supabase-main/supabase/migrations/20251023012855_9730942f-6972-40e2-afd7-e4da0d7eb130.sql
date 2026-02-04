-- Create clinic roles enum
CREATE TYPE clinic_role AS ENUM ('vet', 'vet_tech', 'receptionist');

-- Create clinic_roles table
CREATE TABLE public.clinic_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  role clinic_role NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, clinic_id)
);

-- Enable RLS
ALTER TABLE public.clinic_roles ENABLE ROW LEVEL SECURITY;

-- Policies for clinic_roles
CREATE POLICY "Admins can manage clinic roles"
ON public.clinic_roles
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can view their clinic role"
ON public.clinic_roles
FOR SELECT
USING (user_id = auth.uid());

-- Create function to check clinic role
CREATE OR REPLACE FUNCTION public.has_clinic_role(_user_id uuid, _clinic_id uuid, _role clinic_role)
RETURNS boolean
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

-- Create function to check if user can edit (vet or vet_tech)
CREATE OR REPLACE FUNCTION public.can_edit_clinical_data(_user_id uuid, _clinic_id uuid)
RETURNS boolean
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

-- Migrate existing vet/vet_tech roles from user_roles to clinic_roles
INSERT INTO public.clinic_roles (user_id, clinic_id, role)
SELECT 
  ur.user_id,
  p.clinic_id,
  CASE 
    WHEN ur.role = 'vet'::app_role THEN 'vet'::clinic_role
    WHEN ur.role = 'vet_tech'::app_role THEN 'vet_tech'::clinic_role
    ELSE NULL
  END as clinic_role
FROM user_roles ur
JOIN profiles p ON p.user_id = ur.user_id
WHERE ur.role IN ('vet'::app_role, 'vet_tech'::app_role)
ON CONFLICT (user_id, clinic_id) DO NOTHING;

-- Remove vet and vet_tech from user_roles (they're now clinic roles only)
DELETE FROM user_roles WHERE role IN ('vet'::app_role, 'vet_tech'::app_role);

-- Update consults policies for new structure
DROP POLICY IF EXISTS "Vets and admins can create consults" ON consults;
DROP POLICY IF EXISTS "Vets and admins can delete consults" ON consults;
DROP POLICY IF EXISTS "Vets and admins can update consults" ON consults;

CREATE POLICY "Staff with edit permissions can create consults" ON consults
FOR INSERT 
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
  AND can_edit_clinical_data(auth.uid(), clinic_id)
);

CREATE POLICY "Staff with edit permissions can delete consults" ON consults
FOR DELETE 
USING (
  clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
  AND can_edit_clinical_data(auth.uid(), clinic_id)
);

CREATE POLICY "Staff with edit permissions can update consults" ON consults
FOR UPDATE 
USING (
  clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
  AND can_edit_clinical_data(auth.uid(), clinic_id)
);

-- Update consult_assignments policies
DROP POLICY IF EXISTS "Admins and vets can assign users" ON consult_assignments;
DROP POLICY IF EXISTS "Admins and vets can remove assignments" ON consult_assignments;

CREATE POLICY "Staff with edit permissions can assign users" ON consult_assignments
FOR INSERT 
WITH CHECK (
  consult_id IN (
    SELECT c.id FROM consults c
    JOIN profiles p ON p.clinic_id = c.clinic_id
    WHERE p.user_id = auth.uid()
    AND can_edit_clinical_data(auth.uid(), c.clinic_id)
  )
);

CREATE POLICY "Staff with edit permissions can remove assignments" ON consult_assignments
FOR DELETE 
USING (
  consult_id IN (
    SELECT c.id FROM consults c
    JOIN profiles p ON p.clinic_id = c.clinic_id
    WHERE p.user_id = auth.uid()
    AND can_edit_clinical_data(auth.uid(), c.clinic_id)
  )
);

-- Update owners policies
DROP POLICY IF EXISTS "Vets and admins can manage owners" ON owners;

CREATE POLICY "Staff with edit permissions can manage owners" ON owners
FOR ALL 
USING (
  clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
  AND can_edit_clinical_data(auth.uid(), clinic_id)
);

-- Update patients policies  
DROP POLICY IF EXISTS "Vets and admins can manage patients" ON patients;

CREATE POLICY "Staff with edit permissions can manage patients" ON patients
FOR ALL 
USING (
  clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
  AND can_edit_clinical_data(auth.uid(), clinic_id)
);

-- Update templates policies
DROP POLICY IF EXISTS "Admins and vets can manage templates" ON templates;

CREATE POLICY "Staff with edit permissions can manage templates" ON templates
FOR ALL 
USING (
  clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
  AND can_edit_clinical_data(auth.uid(), clinic_id)
);