-- Drop existing trigger and function that use pg_net
DROP TRIGGER IF EXISTS trigger_send_consult_notification_email ON public.consult_usage_notifications;
DROP FUNCTION IF EXISTS public.send_consult_notification_email();

-- Create simplified function (no pg_net dependency)
CREATE OR REPLACE FUNCTION public.send_consult_notification_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Just return NEW - notification is already logged in the table
  -- Email sending will be handled by frontend polling
  RETURN NEW;
END;
$$;

-- Recreate trigger (now harmless, just for consistency)
CREATE TRIGGER trigger_send_consult_notification_email
AFTER INSERT ON public.consult_usage_notifications
FOR EACH ROW
EXECUTE FUNCTION public.send_consult_notification_email();

-- Add column to track when email was sent
ALTER TABLE public.consult_usage_notifications 
ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

-- Create index for faster queries on unsent notifications
CREATE INDEX IF NOT EXISTS idx_consult_notifications_unsent 
ON public.consult_usage_notifications(clinic_id, email_sent_at) 
WHERE email_sent_at IS NULL;