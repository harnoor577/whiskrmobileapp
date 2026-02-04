-- Drop the overly permissive public access policy
DROP POLICY IF EXISTS "Anyone can view normal ranges" ON public.species_normal_ranges;

-- Require authentication to view normal ranges
CREATE POLICY "Authenticated users can view normal ranges"
  ON public.species_normal_ranges FOR SELECT
  USING (auth.uid() IS NOT NULL);