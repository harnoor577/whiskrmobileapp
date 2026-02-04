-- Drop the existing policy that allows unauthenticated access to templates
DROP POLICY IF EXISTS "Users can view wellness templates" ON public.wellness_templates;

-- Create a new policy that requires authentication for ALL template access
CREATE POLICY "Authenticated users can view wellness templates" 
ON public.wellness_templates 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND (
    clinic_id IS NULL 
    OR clinic_id IN (
      SELECT profiles.clinic_id 
      FROM profiles 
      WHERE profiles.user_id = auth.uid()
    )
  )
);