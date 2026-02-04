-- Grant super_admin role to master admin user
-- First, we need to find the user_id for bbal@growdvm.com and grant super_admin role
-- This will be done via a function that runs once

-- Add super_admin SELECT policies to all tables that need them

-- case_notes
CREATE POLICY "Super admins can view all case notes"
ON public.case_notes
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- chat_messages
CREATE POLICY "Super admins can view all chat messages"
ON public.chat_messages
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- clinic_roles
CREATE POLICY "Super admins can view all clinic roles"
ON public.clinic_roles
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- consult_assignments
CREATE POLICY "Super admins can view all consult assignments"
ON public.consult_assignments
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- consult_audio_segments
CREATE POLICY "Super admins can view all audio segments"
ON public.consult_audio_segments
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- file_assets
CREATE POLICY "Super admins can view all file assets"
ON public.file_assets
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- integration_sync
CREATE POLICY "Super admins can view all integration sync"
ON public.integration_sync
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- messages
CREATE POLICY "Super admins can view all messages"
ON public.messages
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- owners
CREATE POLICY "Super admins can view all owners"
ON public.owners
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- push_subscriptions
CREATE POLICY "Super admins can view all push subscriptions"
ON public.push_subscriptions
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- tasks
CREATE POLICY "Super admins can view all tasks"
ON public.tasks
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- templates
CREATE POLICY "Super admins can view all templates"
ON public.templates
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- user_invitations
CREATE POLICY "Super admins can view all invitations"
ON public.user_invitations
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- user_roles
CREATE POLICY "Super admins can view all user roles"
ON public.user_roles
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admins can also manage (INSERT, UPDATE, DELETE) in key tables
CREATE POLICY "Super admins can manage clinic roles"
ON public.clinic_roles
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage user roles"
ON public.user_roles
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Function to grant super_admin role to specific email
CREATE OR REPLACE FUNCTION public.grant_super_admin_to_email(email_address text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Get user_id from profiles by email
  SELECT user_id INTO target_user_id
  FROM public.profiles
  WHERE email = email_address
  LIMIT 1;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', email_address;
  END IF;
  
  -- Insert super_admin role if it doesn't exist
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'super_admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
END;
$$;

-- Grant super_admin to bbal@growdvm.com
SELECT public.grant_super_admin_to_email('bbal@growdvm.com');