-- Create login_history table for security auditing
CREATE TABLE IF NOT EXISTS public.login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  login_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  device_name TEXT,
  device_fingerprint TEXT,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  failure_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_login_history_user_id ON public.login_history(user_id);
CREATE INDEX idx_login_history_login_time ON public.login_history(login_time DESC);

-- Enable RLS
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own login history
CREATE POLICY "Users can view their own login history"
  ON public.login_history
  FOR SELECT
  USING (auth.uid()::text = user_id::text);

-- Policy: Service role can insert login history
CREATE POLICY "Service role can insert login history"
  ON public.login_history
  FOR INSERT
  WITH CHECK (true);