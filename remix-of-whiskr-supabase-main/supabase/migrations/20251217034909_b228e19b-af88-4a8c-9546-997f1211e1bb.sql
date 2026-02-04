-- Add client_education column to consults table
ALTER TABLE public.consults ADD COLUMN IF NOT EXISTS client_education text;