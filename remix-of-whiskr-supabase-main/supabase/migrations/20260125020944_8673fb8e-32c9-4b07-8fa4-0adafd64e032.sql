-- Add missing columns to consults table
ALTER TABLE public.consults
ADD COLUMN IF NOT EXISTS client_education TEXT;

-- Add missing columns to support_tickets table
ALTER TABLE public.support_tickets
ADD COLUMN IF NOT EXISTS tags TEXT[];