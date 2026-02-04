-- Update add_consults_to_cap to properly add to the cap without resetting usage
CREATE OR REPLACE FUNCTION public.add_consults_to_cap(clinic_uuid uuid, additional_consults integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Check if caller is super admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super admins can add consults';
  END IF;
  
  -- Add consults to the appropriate cap based on subscription status
  -- For trial accounts, increase trial_consults_cap
  -- For paid accounts, increase consults_cap
  -- This does NOT reset consults_used_this_period
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
  
  -- Log the grant for audit purposes
  INSERT INTO public.audit_events (
    clinic_id,
    user_id,
    action,
    entity_type,
    entity_id,
    details
  ) VALUES (
    clinic_uuid,
    auth.uid(),
    'grant_consults',
    'clinic',
    clinic_uuid,
    jsonb_build_object(
      'additional_consults', additional_consults,
      'granted_at', now()
    )
  );
END;
$function$;

-- Create function to handle Stripe webhook events for billing cycle resets
-- This would be called by a webhook handler
CREATE OR REPLACE FUNCTION public.reset_consults_on_rebilling(
  p_stripe_subscription_id text,
  p_billing_cycle_start date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_clinic_id uuid;
BEGIN
  -- Find the clinic with this subscription
  SELECT id INTO v_clinic_id
  FROM public.clinics
  WHERE stripe_subscription_id = p_stripe_subscription_id
  LIMIT 1;
  
  IF v_clinic_id IS NULL THEN
    RAISE NOTICE 'No clinic found with subscription ID: %', p_stripe_subscription_id;
    RETURN;
  END IF;
  
  -- Reset consults and notification flags for new billing cycle
  UPDATE public.clinics
  SET 
    consults_used_this_period = 0,
    grace_consults_used = 0,
    notification_80_sent = false,
    notification_95_sent = false,
    billing_cycle_start_date = p_billing_cycle_start
  WHERE id = v_clinic_id;
  
  -- Log the reset
  INSERT INTO public.audit_events (
    clinic_id,
    action,
    entity_type,
    entity_id,
    details
  ) VALUES (
    v_clinic_id,
    'reset_billing_cycle',
    'clinic',
    v_clinic_id,
    jsonb_build_object(
      'billing_cycle_start', p_billing_cycle_start,
      'reason', 'stripe_rebilling_event'
    )
  );
END;
$function$;