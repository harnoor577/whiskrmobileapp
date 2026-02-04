-- Update all existing clinics to count their current consults
UPDATE public.clinics c
SET consults_used_this_period = (
  SELECT COUNT(*)
  FROM public.consults
  WHERE clinic_id = c.id
);

-- Ensure all trial accounts have max 75 consults cap
UPDATE public.clinics
SET trial_consults_cap = LEAST(trial_consults_cap, 75)
WHERE subscription_status = 'trial';

-- Add function for master admin to add consults
CREATE OR REPLACE FUNCTION public.add_consults_to_cap(clinic_uuid uuid, additional_consults integer)
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
  
  -- For trial accounts, increase trial_consults_cap
  -- For paid accounts, increase consults_cap
  UPDATE public.clinics
  SET 
    trial_consults_cap = CASE 
      WHEN subscription_status = 'trial' THEN trial_consults_cap + additional_consults
      ELSE trial_consults_cap
    END,
    consults_cap = CASE 
      WHEN subscription_status != 'trial' THEN consults_cap + additional_consults
      ELSE consults_cap
    END
  WHERE id = clinic_uuid;
END;
$function$;