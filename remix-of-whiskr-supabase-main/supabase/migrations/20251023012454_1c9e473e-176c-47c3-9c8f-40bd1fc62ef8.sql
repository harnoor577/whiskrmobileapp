-- Update existing role assignments
UPDATE user_roles 
SET role = 'vet'::app_role
WHERE role = 'veterinarian'::app_role;

UPDATE user_roles 
SET role = 'vet_tech'::app_role
WHERE role = 'support_staff'::app_role;

UPDATE user_roles 
SET role = 'receptionist'::app_role
WHERE role = 'front_reception'::app_role;

-- Update RLS policies to use new role names

-- Drop and recreate policies for consults table
DROP POLICY IF EXISTS "Vets and admins can create consults" ON consults;
DROP POLICY IF EXISTS "Vets and admins can delete consults" ON consults;
DROP POLICY IF EXISTS "Vets and admins can update consults" ON consults;

CREATE POLICY "Vets and admins can create consults" ON consults
FOR INSERT 
WITH CHECK (
  (clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()))
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'vet'::app_role))
);

CREATE POLICY "Vets and admins can delete consults" ON consults
FOR DELETE 
USING (
  (clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()))
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'vet'::app_role))
);

CREATE POLICY "Vets and admins can update consults" ON consults
FOR UPDATE 
USING (
  (clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()))
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'vet'::app_role))
);

-- Update policies for consult_assignments
DROP POLICY IF EXISTS "Admins and vets can assign users" ON consult_assignments;
DROP POLICY IF EXISTS "Admins and vets can remove assignments" ON consult_assignments;

CREATE POLICY "Admins and vets can assign users" ON consult_assignments
FOR INSERT 
WITH CHECK (
  (consult_id IN (SELECT id FROM consults WHERE clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())))
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'vet'::app_role))
);

CREATE POLICY "Admins and vets can remove assignments" ON consult_assignments
FOR DELETE 
USING (
  (consult_id IN (SELECT id FROM consults WHERE clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())))
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'vet'::app_role))
);

-- Update policies for owners table
DROP POLICY IF EXISTS "Vets and admins can manage owners" ON owners;

CREATE POLICY "Vets and admins can manage owners" ON owners
FOR ALL 
USING (
  (clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()))
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'vet'::app_role))
);

-- Update policies for patients table
DROP POLICY IF EXISTS "Vets and admins can manage patients" ON patients;

CREATE POLICY "Vets and admins can manage patients" ON patients
FOR ALL 
USING (
  (clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()))
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'vet'::app_role))
);

-- Update policies for templates table
DROP POLICY IF EXISTS "Admins and vets can manage templates" ON templates;

CREATE POLICY "Admins and vets can manage templates" ON templates
FOR ALL 
USING (
  (clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()))
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'vet'::app_role))
);