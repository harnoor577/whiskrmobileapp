-- Add consult tracking fields to clinics table
ALTER TABLE public.clinics 
ADD COLUMN IF NOT EXISTS consults_used_this_period integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS consults_cap integer DEFAULT 50,
ADD COLUMN IF NOT EXISTS billing_cycle_start_date date DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS trial_consults_cap integer DEFAULT 50;

-- Update existing clinics to set proper trial caps based on their trial type
-- Standard trial: 50 consults, Affiliate trial: 75 consults
UPDATE public.clinics 
SET trial_consults_cap = CASE 
  WHEN complimentary_trial_granted = true THEN 75
  ELSE 50
END
WHERE subscription_status = 'trial';

-- Function to check if clinic has reached consult cap
CREATE OR REPLACE FUNCTION public.has_reached_consult_cap(clinic_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    CASE 
      WHEN subscription_tier = 'enterprise' THEN false
      WHEN subscription_status = 'trial' THEN consults_used_this_period >= trial_consults_cap
      ELSE consults_used_this_period >= consults_cap
    END
  FROM public.clinics 
  WHERE id = clinic_uuid;
$function$;

-- Function to increment consult count
CREATE OR REPLACE FUNCTION public.increment_consult_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only increment on INSERT of new consults
  UPDATE public.clinics
  SET consults_used_this_period = consults_used_this_period + 1
  WHERE id = NEW.clinic_id;
  
  RETURN NEW;
END;
$function$;

-- Create trigger to auto-increment consult count
DROP TRIGGER IF EXISTS increment_consult_count_trigger ON public.consults;
CREATE TRIGGER increment_consult_count_trigger
AFTER INSERT ON public.consults
FOR EACH ROW
EXECUTE FUNCTION public.increment_consult_count();

-- Function for master admin to add trial days
CREATE OR REPLACE FUNCTION public.add_trial_days(clinic_uuid uuid, days_to_add integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if caller is super admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super admins can add trial days';
  END IF;
  
  UPDATE public.clinics
  SET trial_ends_at = COALESCE(trial_ends_at, now()) + (days_to_add || ' days')::interval
  WHERE id = clinic_uuid;
END;
$function$;

-- Function for master admin to add consults to current period
CREATE OR REPLACE FUNCTION public.add_consults_this_period(clinic_uuid uuid, consults_to_add integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if caller is super admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super admins can add consults';
  END IF;
  
  UPDATE public.clinics
  SET consults_cap = consults_cap + consults_to_add
  WHERE id = clinic_uuid;
END;
$function$;