-- Add capillary_refill_time column to consults table
ALTER TABLE public.consults 
ADD COLUMN IF NOT EXISTS capillary_refill_time TEXT;