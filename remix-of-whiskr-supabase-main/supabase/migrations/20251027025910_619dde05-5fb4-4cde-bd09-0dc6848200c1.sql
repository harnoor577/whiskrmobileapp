-- Add max_devices to subscription tiers in clinics table
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS max_devices integer;

-- Set default max_devices based on subscription_tier
UPDATE public.clinics SET max_devices = 3 WHERE subscription_tier = 'basic';
UPDATE public.clinics SET max_devices = 5 WHERE subscription_tier = 'professional';
UPDATE public.clinics SET max_devices = -1 WHERE subscription_tier = 'enterprise';

-- Create device_sessions table
CREATE TABLE IF NOT EXISTS public.device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  device_fingerprint text NOT NULL,
  ip_address text,
  user_agent text,
  device_name text,
  last_active_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked boolean NOT NULL DEFAULT false,
  revoked_at timestamp with time zone,
  revoked_by uuid REFERENCES auth.users(id),
  UNIQUE(user_id, device_fingerprint)
);

-- Enable RLS
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for device_sessions
CREATE POLICY "Users can view their own device sessions"
ON public.device_sessions
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can revoke their own device sessions"
ON public.device_sessions
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "System can insert device sessions"
ON public.device_sessions
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admins can view all device sessions"
ON public.device_sessions
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage all device sessions"
ON public.device_sessions
FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Function to count active devices for a clinic
CREATE OR REPLACE FUNCTION public.count_active_devices(_clinic_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT device_fingerprint)::integer
  FROM public.device_sessions
  WHERE clinic_id = _clinic_id
    AND NOT revoked
    AND last_active_at > now() - interval '7 days';
$$;

-- Function to count active devices for a specific user
CREATE OR REPLACE FUNCTION public.count_user_active_devices(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.device_sessions
  WHERE user_id = _user_id
    AND NOT revoked
    AND last_active_at > now() - interval '7 days';
$$;

-- Function to cleanup stale devices (called by cron or manually)
CREATE OR REPLACE FUNCTION public.cleanup_stale_devices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.device_sessions
  SET revoked = true,
      revoked_at = now()
  WHERE last_active_at < now() - interval '30 days'
    AND NOT revoked;
END;
$$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_device_sessions_user_id ON public.device_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_clinic_id ON public.device_sessions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_last_active ON public.device_sessions(last_active_at);
CREATE INDEX IF NOT EXISTS idx_device_sessions_fingerprint ON public.device_sessions(device_fingerprint);