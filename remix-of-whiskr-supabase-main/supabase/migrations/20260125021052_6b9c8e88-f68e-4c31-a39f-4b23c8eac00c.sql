-- Add is_latest column to reports_generated table for versioning
ALTER TABLE public.reports_generated
ADD COLUMN IF NOT EXISTS is_latest BOOLEAN DEFAULT true;