-- Fix the RLS policy that's trying to access auth.users
-- Drop the problematic policy
DROP POLICY IF EXISTS "Recipients can view their invitations" ON public.user_invitations;

-- Create a security definer function to get current user's email
CREATE OR REPLACE FUNCTION public.get_current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Recreate the policy using the profiles table instead
CREATE POLICY "Recipients can view their invitations"
ON public.user_invitations
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  email = public.get_current_user_email()
);