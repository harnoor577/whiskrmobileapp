-- Create medication profile cache table
CREATE TABLE public.medication_profile_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_name_normalized text NOT NULL UNIQUE,
  drug_name_display text NOT NULL,
  profile_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- Index for fast lookups by normalized drug name
CREATE INDEX idx_medication_cache_drug_name ON public.medication_profile_cache (drug_name_normalized);

-- Index to help find expired entries for cleanup
CREATE INDEX idx_medication_cache_expires ON public.medication_profile_cache (expires_at);

-- Enable RLS (service role bypasses this, but good practice)
ALTER TABLE public.medication_profile_cache ENABLE ROW LEVEL SECURITY;

-- Create cleanup function for expired cache entries
CREATE OR REPLACE FUNCTION public.cleanup_expired_medication_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM public.medication_profile_cache
  WHERE expires_at < now();
END;
$$;