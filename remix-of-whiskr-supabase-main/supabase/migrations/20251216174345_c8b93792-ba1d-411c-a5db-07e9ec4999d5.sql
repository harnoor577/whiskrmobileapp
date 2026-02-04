-- Add clinical_considerations column to consults table
ALTER TABLE public.consults 
ADD COLUMN IF NOT EXISTS clinical_considerations JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.consults.clinical_considerations IS 'Stores extracted clinical constraints and considerations from Dr. CatScan chat messages (e.g., owner declined treatment, budget limits, equipment unavailable)';