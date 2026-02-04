-- Policy change: new signups should NOT receive automatic trial by default
-- 1) Update clinics defaults
ALTER TABLE public.clinics
  ALTER COLUMN subscription_status SET DEFAULT 'free',
  ALTER COLUMN trial_ends_at DROP DEFAULT;

-- 2) Update existing clinics that were put on trial automatically without admin approval
-- Convert any clinic with subscription_status='trial' AND complimentary_trial_granted=false to 'free'
UPDATE public.clinics
SET subscription_status = 'free',
    trial_ends_at = NULL
WHERE subscription_status = 'trial'
  AND COALESCE(complimentary_trial_granted, false) = false;

-- 3) Replace handle_new_user trigger function to stop creating trial clinics by default
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  new_clinic_id uuid;
BEGIN
  -- Create a new clinic for the user with NO trial by default
  INSERT INTO public.clinics (
    name,
    phone,
    address,
    subscription_status,
    billing_cycle_start_date,
    subscription_tier
  )
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'clinic_name', 'My Clinic'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    '',
    'free',
    CURRENT_DATE,
    'basic'
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

  -- Assign vet clinic_role by default
  INSERT INTO public.clinic_roles (user_id, clinic_id, role)
  VALUES (NEW.id, new_clinic_id, 'vet'::clinic_role);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_new_user (no-trial version): %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 4) Keep helper for admins to grant trials (already exists), no change required