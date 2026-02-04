-- Drop existing problematic policies on profiles table
DROP POLICY IF EXISTS "Users can view profiles in same clinic" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;

-- Create a helper function to get user's clinic_id without recursion
CREATE OR REPLACE FUNCTION public.get_user_clinic_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Recreate policies using the helper function (no recursion)
CREATE POLICY "Users can view profiles in same clinic"
ON public.profiles
FOR SELECT
USING (clinic_id = public.get_user_clinic_id());

CREATE POLICY "Admins can manage profiles"
ON public.profiles
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND clinic_id = public.get_user_clinic_id()
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);

-- Fix the handle_new_user trigger to ensure it works properly
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_clinic_id uuid;
BEGIN
  -- Create a new clinic for the user
  INSERT INTO public.clinics (name, phone, address)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'clinic_name', 'My Clinic'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    ''
  )
  RETURNING id INTO new_clinic_id;

  -- Create profile
  INSERT INTO public.profiles (user_id, clinic_id, name, email, phone)
  VALUES (
    NEW.id,
    new_clinic_id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  );

  -- Assign admin role by default
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin'::app_role);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_new_user: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();