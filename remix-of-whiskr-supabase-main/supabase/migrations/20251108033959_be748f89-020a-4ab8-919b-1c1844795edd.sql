-- Remove grace_consults_used column from clinics table
ALTER TABLE public.clinics DROP COLUMN IF EXISTS grace_consults_used;

-- Update increment_consult_count to remove grace logic and hard-stop at cap
CREATE OR REPLACE FUNCTION public.increment_consult_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_record RECORD;
  v_cap INTEGER;
  v_used INTEGER;
  v_percentage NUMERIC;
  v_is_trial BOOLEAN;
BEGIN
  -- Get clinic details (no grace_consults_used)
  SELECT 
    subscription_status,
    subscription_tier,
    consults_cap,
    trial_consults_cap,
    consults_used_this_period,
    notification_80_sent,
    notification_95_sent,
    billing_cycle_start_date
  INTO v_clinic_record
  FROM public.clinics
  WHERE id = NEW.clinic_id;
  
  -- Determine if trial and which cap to use
  v_is_trial := v_clinic_record.subscription_status = 'trial';
  v_cap := CASE 
    WHEN v_is_trial THEN v_clinic_record.trial_consults_cap
    ELSE v_clinic_record.consults_cap
  END;
  
  -- Skip increment if enterprise (unlimited)
  IF v_clinic_record.subscription_tier = 'enterprise' THEN
    RETURN NEW;
  END IF;
  
  v_used := v_clinic_record.consults_used_this_period;
  
  -- Only increment if under cap (NO GRACE PERIOD)
  IF v_used < v_cap THEN
    UPDATE public.clinics
    SET consults_used_this_period = consults_used_this_period + 1
    WHERE id = NEW.clinic_id;
    
    v_used := v_used + 1;
  END IF;
  
  -- Calculate percentage and send notifications
  IF v_cap > 0 THEN
    v_percentage := (v_used::NUMERIC / v_cap::NUMERIC) * 100;
    
    -- 80% threshold
    IF v_percentage >= 80 AND v_percentage < 95 AND NOT v_clinic_record.notification_80_sent THEN
      UPDATE public.clinics
      SET notification_80_sent = true
      WHERE id = NEW.clinic_id;
      
      INSERT INTO public.consult_usage_notifications (
        clinic_id, threshold_percentage, billing_cycle_start, 
        consults_at_notification, consults_cap
      ) VALUES (
        NEW.clinic_id, 80, v_clinic_record.billing_cycle_start_date, 
        v_used, v_cap
      );
    END IF;
    
    -- 95% threshold
    IF v_percentage >= 95 AND NOT v_clinic_record.notification_95_sent THEN
      UPDATE public.clinics
      SET notification_95_sent = true
      WHERE id = NEW.clinic_id;
      
      INSERT INTO public.consult_usage_notifications (
        clinic_id, threshold_percentage, billing_cycle_start, 
        consults_at_notification, consults_cap
      ) VALUES (
        NEW.clinic_id, 95, v_clinic_record.billing_cycle_start_date, 
        v_used, v_cap
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update reset_billing_cycle_notifications (remove grace reset)
CREATE OR REPLACE FUNCTION public.reset_billing_cycle_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clinics
  SET 
    notification_80_sent = false,
    notification_95_sent = false,
    consults_used_this_period = 0,
    billing_cycle_start_date = CURRENT_DATE
  WHERE 
    billing_cycle_start_date IS NOT NULL 
    AND billing_cycle_start_date <= CURRENT_DATE - INTERVAL '30 days'
    AND subscription_status = 'active';
END;
$$;

-- Update reset_consults_on_rebilling (remove grace reset)
CREATE OR REPLACE FUNCTION public.reset_consults_on_rebilling(p_stripe_subscription_id text, p_billing_cycle_start date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  SELECT id INTO v_clinic_id
  FROM public.clinics
  WHERE stripe_subscription_id = p_stripe_subscription_id
  LIMIT 1;
  
  IF v_clinic_id IS NULL THEN
    RAISE NOTICE 'No clinic found with subscription ID: %', p_stripe_subscription_id;
    RETURN;
  END IF;
  
  UPDATE public.clinics
  SET 
    consults_used_this_period = 0,
    notification_80_sent = false,
    notification_95_sent = false,
    billing_cycle_start_date = p_billing_cycle_start
  WHERE id = v_clinic_id;
  
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
$$;

-- Update grant_complimentary_trial (remove grace reset)
CREATE OR REPLACE FUNCTION public.grant_complimentary_trial(clinic_uuid uuid, trial_days integer, trial_plan text DEFAULT 'basic'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();
  
  IF NOT has_role(current_user_id, 'super_admin') THEN
    RAISE EXCEPTION 'Only super admins can grant complimentary trials';
  END IF;
  
  UPDATE clinics
  SET 
    trial_ends_at = NOW() + (trial_days || ' days')::INTERVAL,
    complimentary_trial_granted = TRUE,
    complimentary_trial_granted_by = current_user_id,
    complimentary_trial_granted_at = NOW(),
    subscription_status = 'active',
    subscription_tier = trial_plan,
    billing_cycle_start_date = CURRENT_DATE,
    consults_used_this_period = 0,
    notification_80_sent = FALSE,
    notification_95_sent = FALSE,
    consults_cap = CASE 
      WHEN trial_plan = 'professional' THEN 200
      WHEN trial_plan = 'basic' THEN 100
      ELSE 50
    END
  WHERE id = clinic_uuid;
END;
$$;

-- Create simplified function to check consult creation eligibility
CREATE OR REPLACE FUNCTION public.can_create_consult(clinic_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      -- Enterprise: always allowed
      WHEN subscription_tier = 'enterprise' THEN true
      -- Trial: check against trial cap
      WHEN subscription_status = 'trial' THEN consults_used_this_period < trial_consults_cap
      -- Paid: check against regular cap
      ELSE consults_used_this_period < consults_cap
    END
  FROM public.clinics 
  WHERE id = clinic_uuid;
$$;

-- Create trigger to enforce limit at database level
CREATE OR REPLACE FUNCTION public.prevent_consult_creation_over_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT can_create_consult(NEW.clinic_id) THEN
    RAISE EXCEPTION 'Consultation limit reached. Please upgrade your plan to create more consultations.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_prevent_consult_over_limit ON public.consults;
CREATE TRIGGER trigger_prevent_consult_over_limit
BEFORE INSERT ON public.consults
FOR EACH ROW
EXECUTE FUNCTION public.prevent_consult_creation_over_limit();