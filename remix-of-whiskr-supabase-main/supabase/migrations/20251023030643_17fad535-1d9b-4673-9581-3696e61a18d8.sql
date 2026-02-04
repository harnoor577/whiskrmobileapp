-- Step 1: Update the handle_new_user function to assign both admin app_role and vet clinic_role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_clinic_id uuid;
  trial_days integer;
BEGIN
  -- Get trial days from user metadata (30 if referral, 14 default)
  trial_days := COALESCE((NEW.raw_user_meta_data->>'trial_days')::integer, 14);
  
  -- Create a new clinic for the user with appropriate trial period
  INSERT INTO public.clinics (name, phone, address, trial_ends_at)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'clinic_name', 'My Clinic'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    '',
    now() + (trial_days || ' days')::interval
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

  -- Assign admin app_role by default
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin'::app_role);

  -- Assign vet clinic_role by default (gives clinical data editing permissions)
  INSERT INTO public.clinic_roles (user_id, clinic_id, role)
  VALUES (NEW.id, new_clinic_id, 'vet'::clinic_role);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_new_user: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Step 2: Fix all existing single-user clinics (clinics with only one user)
-- Add vet clinic_role to all users in single-user clinics who don't have it
DO $$
DECLARE
  profile_record RECORD;
BEGIN
  FOR profile_record IN 
    SELECT DISTINCT p.user_id, p.clinic_id
    FROM public.profiles p
    WHERE p.clinic_id IN (
      SELECT clinic_id 
      FROM public.profiles 
      GROUP BY clinic_id 
      HAVING COUNT(*) = 1
    )
  LOOP
    -- Insert vet role if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM public.clinic_roles 
      WHERE user_id = profile_record.user_id 
      AND clinic_id = profile_record.clinic_id 
      AND role = 'vet'::clinic_role
    ) THEN
      INSERT INTO public.clinic_roles (user_id, clinic_id, role)
      VALUES (profile_record.user_id, profile_record.clinic_id, 'vet'::clinic_role);
    END IF;
    
    -- Insert admin role if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = profile_record.user_id 
      AND role = 'admin'::app_role
    ) THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (profile_record.user_id, 'admin'::app_role);
    END IF;
  END LOOP;
END $$;