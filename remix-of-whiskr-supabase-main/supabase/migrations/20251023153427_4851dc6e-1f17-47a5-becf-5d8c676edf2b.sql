-- Grant super_admin role to bbal@growdvm.com automatically
-- This function ensures bbal@growdvm.com always has super_admin access

-- First, create or replace the function to grant super admin to specific email
CREATE OR REPLACE FUNCTION public.grant_super_admin_to_specific_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the new user's email is bbal@growdvm.com
  IF NEW.email = 'bbal@growdvm.com' THEN
    -- Insert super_admin role if it doesn't exist
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically grant super_admin on user creation
DROP TRIGGER IF EXISTS on_auth_user_created_grant_super_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_super_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_super_admin_to_specific_user();

-- Also grant super_admin to bbal@growdvm.com if they already exist
DO $$
DECLARE
  user_uuid uuid;
BEGIN
  -- Find the user_id for bbal@growdvm.com
  SELECT id INTO user_uuid
  FROM auth.users
  WHERE email = 'bbal@growdvm.com';
  
  -- If user exists, ensure they have super_admin role
  IF user_uuid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_uuid, 'super_admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;