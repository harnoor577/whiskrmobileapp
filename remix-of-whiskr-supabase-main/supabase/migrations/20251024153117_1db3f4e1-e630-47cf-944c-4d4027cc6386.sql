-- Update default trial consult caps and add support ticket tracking
-- Regular trial: 7 days, 25 consults
-- Affiliate trial: 14 days, 50 consults

-- Update clinics table default
ALTER TABLE public.clinics 
  ALTER COLUMN trial_consults_cap SET DEFAULT 25;

-- Update existing trial accounts to have max 50 consults
UPDATE public.clinics
SET trial_consults_cap = LEAST(trial_consults_cap, 50)
WHERE subscription_status = 'trial';

-- Add closed_by tracking to support tickets
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone;

-- Update support_ticket_replies to track if it's from support
ALTER TABLE public.support_ticket_replies
  ADD COLUMN IF NOT EXISTS is_support_reply boolean DEFAULT false;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_ticket_id ON public.support_ticket_replies(ticket_id);

-- Update handle_new_user function to use new defaults
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
  -- Regular trial: 7 days, 25 consults
  -- Affiliate trial: 14 days, 50 consults
  trial_days := COALESCE((NEW.raw_user_meta_data->>'trial_days')::integer, 7);
  trial_cap := COALESCE((NEW.raw_user_meta_data->>'trial_consults_cap')::integer, 25);
  
  -- Ensure trial cap never exceeds 50 for free trials
  IF trial_cap > 50 THEN
    trial_cap := 50;
  END IF;
  
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