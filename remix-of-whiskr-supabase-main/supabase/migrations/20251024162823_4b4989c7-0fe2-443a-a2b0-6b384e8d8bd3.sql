-- =====================================================
-- Phase 1 Security Fix: Rate Limiting Infrastructure
-- =====================================================

-- Create rate limiting table for authentication attempts
CREATE TABLE IF NOT EXISTS public.rate_limit_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, -- email or IP address
  action TEXT NOT NULL, -- 'otp_send', 'otp_verify', 'backup_verify', 'backup_generate'
  attempt_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  lockout_reason TEXT,
  lockout_level INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limit_identifier_action 
  ON public.rate_limit_attempts(identifier, action, window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limit_locked_until 
  ON public.rate_limit_attempts(locked_until) WHERE locked_until IS NOT NULL;

-- Enable RLS
ALTER TABLE public.rate_limit_attempts ENABLE ROW LEVEL SECURITY;

-- System can manage rate limits (edge functions use service role)
CREATE POLICY "System can manage rate limits"
  ON public.rate_limit_attempts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Super admins can view rate limits for monitoring
CREATE POLICY "Super admins can view rate limits"
  ON public.rate_limit_attempts FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Function to cleanup old rate limit records (>24 hours)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limit_attempts
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$;

-- =====================================================
-- Phase 1 Security Fix: Support Agent Access Restriction
-- =====================================================

-- Add related_consult_id to support_tickets for granular access control
ALTER TABLE public.support_tickets 
  ADD COLUMN IF NOT EXISTS related_consult_id UUID REFERENCES public.consults(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_support_tickets_related_consult 
  ON public.support_tickets(related_consult_id) WHERE related_consult_id IS NOT NULL;

-- Update RLS Policy: Support agents can ONLY view consults related to their tickets
DROP POLICY IF EXISTS "Support agents can view consults for clinics with open tickets" ON public.consults;

CREATE POLICY "Support agents can view only ticket-related consults"
  ON public.consults FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM public.support_agents sa
      JOIN public.support_tickets st ON st.clinic_id = consults.clinic_id
      WHERE sa.user_id = auth.uid()
        AND st.related_consult_id = consults.id
        AND st.status IN ('open', 'in_progress')
    )
  );

-- Update RLS Policy: Support agents can ONLY view patients related to their tickets
DROP POLICY IF EXISTS "Support agents can view patients for clinics with open tickets" ON public.patients;

CREATE POLICY "Support agents can view only ticket-related patients"
  ON public.patients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM public.support_agents sa
      JOIN public.support_tickets st ON st.related_consult_id IS NOT NULL
      JOIN public.consults c ON c.id = st.related_consult_id
      WHERE sa.user_id = auth.uid()
        AND c.patient_id = patients.id
        AND st.status IN ('open', 'in_progress')
    )
  );

-- Update RLS Policy: Support agents can ONLY view chat messages from their tickets
DROP POLICY IF EXISTS "Support agents can view chat messages for clinics with open tic" ON public.chat_messages;

CREATE POLICY "Support agents can view only ticket-related chat messages"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM public.support_agents sa
      JOIN public.support_tickets st ON st.related_consult_id IS NOT NULL
      WHERE sa.user_id = auth.uid()
        AND st.related_consult_id = chat_messages.consult_id
        AND st.status IN ('open', 'in_progress')
    )
  );

-- RPC function to unlock master admin account (super admin only)
CREATE OR REPLACE FUNCTION public.unlock_master_admin_account(p_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only super admins can unlock accounts
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super admins can unlock accounts';
  END IF;

  -- Clear lockout for all actions related to this email
  UPDATE public.rate_limit_attempts
  SET locked_until = NULL,
      lockout_reason = NULL,
      lockout_level = 0
  WHERE identifier = p_email
    AND locked_until > NOW();
END;
$$;