-- Create extension_tokens table for API token storage
CREATE TABLE public.extension_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  name TEXT DEFAULT 'EzyVet Extension',
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

-- Indexes for fast lookups
CREATE INDEX idx_extension_tokens_user_id ON public.extension_tokens(user_id);
CREATE INDEX idx_extension_tokens_clinic_id ON public.extension_tokens(clinic_id);
CREATE INDEX idx_extension_tokens_active ON public.extension_tokens(user_id) WHERE revoked_at IS NULL;

-- Enable Row Level Security
ALTER TABLE public.extension_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own tokens"
  ON public.extension_tokens FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own tokens"
  ON public.extension_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own tokens"
  ON public.extension_tokens FOR UPDATE
  USING (user_id = auth.uid());

-- Super admins can view all tokens for support purposes
CREATE POLICY "Super admins can view all tokens"
  ON public.extension_tokens FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role));