-- Drop the existing policy
DROP POLICY IF EXISTS "Users can view their clinic" ON public.clinics;

-- Create updated policy with explicit authentication check
CREATE POLICY "Users can view their clinic" 
ON public.clinics
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND id IN (
    SELECT profiles.clinic_id
    FROM profiles
    WHERE profiles.user_id = auth.uid()
  )
);