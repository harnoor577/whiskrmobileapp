-- Add final treatment plan persistence
ALTER TABLE public.consults
ADD COLUMN IF NOT EXISTS final_summary text,
ADD COLUMN IF NOT EXISTS final_treatment_plan text,
ADD COLUMN IF NOT EXISTS plan_locked boolean DEFAULT false;

-- Index to quickly filter finalized plans
CREATE INDEX IF NOT EXISTS idx_consults_plan_locked ON public.consults (plan_locked);
