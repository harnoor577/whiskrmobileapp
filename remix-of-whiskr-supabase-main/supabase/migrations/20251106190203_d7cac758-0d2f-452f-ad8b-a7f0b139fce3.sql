-- Update grant_complimentary_trial function to accept plan parameter
CREATE OR REPLACE FUNCTION grant_complimentary_trial(
  clinic_uuid UUID,
  trial_days INTEGER,
  trial_plan TEXT DEFAULT 'basic'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();
  
  -- Check if user is super admin
  IF NOT has_role(current_user_id, 'super_admin') THEN
    RAISE EXCEPTION 'Only super admins can grant complimentary trials';
  END IF;
  
  -- Update clinic with trial information and subscription tier
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
    grace_consults_used = 0,
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