-- Set default max_devices to 3 for clinics table
ALTER TABLE public.clinics 
ALTER COLUMN max_devices SET DEFAULT 3;

-- Update existing clinics with NULL max_devices to 3
UPDATE public.clinics
SET max_devices = 3
WHERE max_devices IS NULL;

-- Update the handle_new_user function to set max_devices based on subscription tier
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  new_clinic_id uuid;
  trial_days integer;
  trial_cap integer;
BEGIN
  -- Get trial days and consult cap from user metadata
  -- Regular trial: 7 days, 25 consults
  -- Affiliate trial: 14 days, 50 consults
  trial_days := COALESCE((NEW.raw_user_meta_data->>'trial_days')::integer, 7);
  trial_cap := COALESCE((NEW.raw_user_meta_data->>'trial_consults_cap')::integer, 25);
  
  -- Ensure trial cap never exceeds 50 for free trials
  IF trial_cap > 50 THEN
    trial_cap := 50;
  END IF;
  
  -- Create a new clinic for the user with appropriate trial period
  -- Trial accounts get 3 devices (will use default)
  INSERT INTO public.clinics (
    name, 
    phone, 
    address, 
    trial_ends_at, 
    trial_consults_cap,
    billing_cycle_start_date,
    subscription_tier
  )
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'clinic_name', 'My Clinic'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    '',
    now() + (trial_days || ' days')::interval,
    trial_cap,
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
  RAISE LOG 'Error in handle_new_user: %', SQLERRM;
  RETURN NEW;
END;
$$;