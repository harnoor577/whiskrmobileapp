-- Add database trigger to automatically send notification emails
CREATE OR REPLACE FUNCTION public.send_consult_notification_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  -- Build the payload for the edge function
  v_payload := jsonb_build_object(
    'record', jsonb_build_object(
      'clinic_id', NEW.clinic_id,
      'threshold_percentage', NEW.threshold_percentage,
      'consults_at_notification', NEW.consults_at_notification,
      'consults_cap', NEW.consults_cap,
      'billing_cycle_start', NEW.billing_cycle_start
    )
  );
  
  -- Use pg_net to invoke the edge function asynchronously
  -- This prevents blocking the INSERT transaction
  PERFORM
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/trigger-consult-limit-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := v_payload
    );
  
  RETURN NEW;
END;
$$;

-- Create trigger on consult_usage_notifications table
DROP TRIGGER IF EXISTS trigger_send_consult_notification_email ON public.consult_usage_notifications;
CREATE TRIGGER trigger_send_consult_notification_email
AFTER INSERT ON public.consult_usage_notifications
FOR EACH ROW
EXECUTE FUNCTION public.send_consult_notification_email();

-- Reset billing cycle notification flags when cycle resets
CREATE OR REPLACE FUNCTION public.reset_billing_cycle_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reset notification flags for clinics where billing cycle has passed
  UPDATE public.clinics
  SET 
    notification_80_sent = false,
    notification_95_sent = false,
    grace_consults_used = 0,
    consults_used_this_period = 0,
    billing_cycle_start_date = CURRENT_DATE
  WHERE 
    billing_cycle_start_date IS NOT NULL 
    AND billing_cycle_start_date <= CURRENT_DATE - INTERVAL '30 days'
    AND subscription_status = 'active';
END;
$$;