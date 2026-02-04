-- Add missing attitude column to consults table
ALTER TABLE public.consults 
ADD COLUMN IF NOT EXISTS attitude TEXT;