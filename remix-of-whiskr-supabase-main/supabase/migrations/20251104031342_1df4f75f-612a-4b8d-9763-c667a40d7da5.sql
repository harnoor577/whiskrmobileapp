-- Allow receptionists to create and edit patients
CREATE POLICY "Receptionists can manage patients" ON public.patients
FOR ALL
TO authenticated
USING (
  clinic_id IN (
    SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.clinic_roles
    WHERE user_id = auth.uid()
      AND clinic_id = patients.clinic_id
      AND role = 'receptionist'::clinic_role
  )
)
WITH CHECK (
  clinic_id IN (
    SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.clinic_roles
    WHERE user_id = auth.uid()
      AND clinic_id = patients.clinic_id
      AND role = 'receptionist'::clinic_role
  )
);

-- Allow receptionists to create and edit owners
CREATE POLICY "Receptionists can manage owners" ON public.owners
FOR ALL
TO authenticated
USING (
  clinic_id IN (
    SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.clinic_roles
    WHERE user_id = auth.uid()
      AND clinic_id = owners.clinic_id
      AND role = 'receptionist'::clinic_role
  )
)
WITH CHECK (
  clinic_id IN (
    SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.clinic_roles
    WHERE user_id = auth.uid()
      AND clinic_id = owners.clinic_id
      AND role = 'receptionist'::clinic_role
  )
);