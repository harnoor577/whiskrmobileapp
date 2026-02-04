-- Add a minimal RLS policy for the cache table (service role bypasses RLS anyway)
-- This just satisfies the linter - no user access needed
CREATE POLICY "Service role only - medication cache"
ON public.medication_profile_cache
FOR ALL
USING (false)
WITH CHECK (false);