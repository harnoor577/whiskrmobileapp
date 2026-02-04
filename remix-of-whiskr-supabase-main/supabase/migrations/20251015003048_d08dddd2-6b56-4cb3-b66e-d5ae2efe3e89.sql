-- Add reason_for_visit column to consults table
ALTER TABLE public.consults 
ADD COLUMN reason_for_visit text;