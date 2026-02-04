-- Add DVM confirmation tracking columns to consults table
ALTER TABLE public.consults 
ADD COLUMN IF NOT EXISTS visit_type_confirmed_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS visit_type_confirmed_at TIMESTAMPTZ;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_consults_visit_type_confirmed 
ON public.consults(visit_type_confirmed_by, visit_type_confirmed_at);