-- Update handle_new_user to set trial consults cap
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_clinic_id uuid;
  trial_days integer;
  trial_cap integer;
BEGIN
  -- Get trial days and consult cap from user metadata
  trial_days := COALESCE((NEW.raw_user_meta_data->>'trial_days')::integer, 7);
  trial_cap := COALESCE((NEW.raw_user_meta_data->>'trial_consults_cap')::integer, 50);
  
  -- Create a new clinic for the user with appropriate trial period
  INSERT INTO public.clinics (
    name, 
    phone, 
    address, 
    trial_ends_at, 
    trial_consults_cap,
    billing_cycle_start_date
  )
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'clinic_name', 'My Clinic'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    '',
    now() + (trial_days || ' days')::interval,
    trial_cap,
    CURRENT_DATE
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
$function$;