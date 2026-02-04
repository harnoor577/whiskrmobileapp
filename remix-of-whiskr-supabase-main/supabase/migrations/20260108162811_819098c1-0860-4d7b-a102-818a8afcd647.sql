-- Fix profiles table RLS: Restrict full profile access to admins only
-- Non-admins can only view their own profile

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view profiles in same clinic" ON public.profiles;

-- Create new restrictive policy: users see own profile OR admins see all clinic profiles
CREATE POLICY "Users view own profile or admin views all" ON public.profiles
  FOR SELECT 
  USING (
    user_id = auth.uid() 
    OR (
      has_role(auth.uid(), 'admin'::app_role) 
      AND clinic_id = get_user_clinic_id()
    )
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Create a view for staff directory (limited fields only) for non-admin access to team member names
CREATE OR REPLACE VIEW public.staff_directory AS
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