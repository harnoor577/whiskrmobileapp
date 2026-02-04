-- Fix RLS for user_invitations to allow admins to manage clinic invites and recipients to view their own
-- 1) Drop existing restrictive policies that block admin visibility
DROP POLICY IF EXISTS "Admins can manage invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Users can view their invitations" ON public.user_invitations;

-- 2) Recreate PERMISSIVE policies
-- Admins: view all invites for their clinic
CREATE POLICY "Admins can view clinic invitations"
ON public.user_invitations
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND clinic_id IN (
    SELECT p.clinic_id FROM public.profiles p WHERE p.user_id = auth.uid()
  )
);

-- Admins: create invites in their clinic
CREATE POLICY "Admins can create invitations"
ON public.user_invitations
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND clinic_id IN (
    SELECT p.clinic_id FROM public.profiles p WHERE p.user_id = auth.uid()
  )
);

-- Admins: update/delete invites in their clinic
CREATE POLICY "Admins can modify clinic invitations"
ON public.user_invitations
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND clinic_id IN (
    SELECT p.clinic_id FROM public.profiles p WHERE p.user_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND clinic_id IN (
    SELECT p.clinic_id FROM public.profiles p WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can delete clinic invitations"
ON public.user_invitations
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND clinic_id IN (
    SELECT p.clinic_id FROM public.profiles p WHERE p.user_id = auth.uid()
  )
);

-- Recipients: view their own invitations by email
CREATE POLICY "Recipients can view their invitations"
ON public.user_invitations
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  email = (
    SELECT u.email::text FROM auth.users u WHERE u.id = auth.uid()
  )
);
