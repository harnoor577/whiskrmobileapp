-- Add regeneration tracking and timeline to consults table

-- Add regen_status column to track AI regeneration state
ALTER TABLE public.consults 
ADD COLUMN IF NOT EXISTS regen_status TEXT DEFAULT 'ready' 
CHECK (regen_status IN ('pending', 'ready', 'error'));

-- Add timeline column for version history (audit trail)
ALTER TABLE public.consults 
ADD COLUMN IF NOT EXISTS timeline JSONB DEFAULT '[]'::jsonb;

-- Add index on regen_status for efficient queries
CREATE INDEX IF NOT EXISTS idx_consults_regen_status 
ON public.consults(regen_status);

-- Add comment explaining timeline structure
COMMENT ON COLUMN public.consults.timeline IS 
'Version history with events like: {"event":"finalized","by":"uuid","at":"timestamp","version":1}';

-- Add comment explaining regen_status
COMMENT ON COLUMN public.consults.regen_status IS 
'Tracks AI regeneration state: pending (regenerating), ready (complete), error (failed)';