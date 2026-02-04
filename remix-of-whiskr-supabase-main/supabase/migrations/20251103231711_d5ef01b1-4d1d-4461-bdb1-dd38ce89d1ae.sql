-- Add policy to allow admins to manage owners in their clinic
CREATE POLICY "Admins can manage owners in their clinic" ON public.owners
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND clinic_id IN (
    SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  AND clinic_id IN (
    SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
  )
);