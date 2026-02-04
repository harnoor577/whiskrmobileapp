-- Create medication profile cache table for storing generated profiles
CREATE TABLE public.medication_profile_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_name_normalized TEXT NOT NULL UNIQUE,
  drug_name_display TEXT NOT NULL,
  profile_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '3 months')
);

-- Index for fast lookups by drug name
CREATE INDEX idx_medication_cache_drug_name ON public.medication_profile_cache(drug_name_normalized);

-- Index for finding expired entries
CREATE INDEX idx_medication_cache_expires ON public.medication_profile_cache(expires_at);

-- Enable RLS
ALTER TABLE public.medication_profile_cache ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read cached profiles
CREATE POLICY "Authenticated users can read medication cache"
  ON public.medication_profile_cache FOR SELECT
  TO authenticated
  USING (true);

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_medication_cache_updated_at
  BEFORE UPDATE ON public.medication_profile_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();