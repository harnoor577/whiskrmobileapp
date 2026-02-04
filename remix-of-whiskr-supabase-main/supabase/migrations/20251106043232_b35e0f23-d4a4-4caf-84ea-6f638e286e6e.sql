-- Add grace consults and notification tracking to clinics table
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS grace_consults_used INTEGER DEFAULT 0;
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS notification_80_sent BOOLEAN DEFAULT false;
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS notification_95_sent BOOLEAN DEFAULT false;

-- Create table to track consult usage notifications
CREATE TABLE IF NOT EXISTS public.consult_usage_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  threshold_percentage INTEGER NOT NULL, -- 80 or 95
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  billing_cycle_start DATE NOT NULL,
  consults_at_notification INTEGER NOT NULL,
  consults_cap INTEGER NOT NULL
);

-- Enable RLS
ALTER TABLE public.consult_usage_notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for notification tracking
CREATE POLICY "Admins can view their clinic notifications"
  ON public.consult_usage_notifications FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "System can insert notifications"
  ON public.consult_usage_notifications FOR INSERT
  WITH CHECK (true);

-- Update increment_consult_count to handle notifications and grace period
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
  -- Get clinic details
  SELECT 
    subscription_status,
    subscription_tier,
    consults_cap,
    trial_consults_cap,
    consults_used_this_period,
    grace_consults_used,
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
  
  -- Check if we're in normal range or grace period
  IF v_used < v_cap THEN
    -- Normal increment
    UPDATE public.clinics
    SET consults_used_this_period = consults_used_this_period + 1
    WHERE id = NEW.clinic_id;
    
    v_used := v_used + 1;
  ELSIF v_clinic_record.grace_consults_used < 5 THEN
    -- Grace period increment
    UPDATE public.clinics
    SET grace_consults_used = grace_consults_used + 1
    WHERE id = NEW.clinic_id;
  END IF;
  
  -- Calculate percentage (only for non-enterprise)
  IF v_cap > 0 THEN
    v_percentage := (v_used::NUMERIC / v_cap::NUMERIC) * 100;
    
    -- Check for 80% threshold
    IF v_percentage >= 80 AND v_percentage < 95 AND NOT v_clinic_record.notification_80_sent THEN
      -- Mark as sent and log
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
    
    -- Check for 95% threshold
    IF v_percentage >= 95 AND NOT v_clinic_record.notification_95_sent THEN
      -- Mark as sent and log
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