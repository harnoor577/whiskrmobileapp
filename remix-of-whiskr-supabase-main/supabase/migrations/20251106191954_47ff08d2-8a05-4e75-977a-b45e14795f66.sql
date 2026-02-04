-- Add procedure-specific fields to consults table
ALTER TABLE public.consults
ADD COLUMN IF NOT EXISTS procedure_name TEXT,
ADD COLUMN IF NOT EXISTS procedure_indication TEXT,
ADD COLUMN IF NOT EXISTS procedure_date_time TIMESTAMP WITH TIME ZONE;