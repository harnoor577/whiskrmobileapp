-- Fix staff_directory view to use SECURITY INVOKER (default is SECURITY DEFINER which bypasses RLS)
DROP VIEW IF EXISTS public.staff_directory;

CREATE VIEW public.staff_directory 
WITH (security_invoker = true)
AS
SELECT 
  id,
  user_id,
  clinic_id,
  name,
  name_prefix,
  user_type,
  dvm_role
FROM public.profiles;

-- Grant access to the view for authenticated users
GRANT SELECT ON public.staff_directory TO authenticated;