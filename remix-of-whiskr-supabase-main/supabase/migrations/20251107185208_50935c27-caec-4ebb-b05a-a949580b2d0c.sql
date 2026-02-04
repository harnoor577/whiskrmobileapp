-- Add missing vital columns to consults table
ALTER TABLE public.consults 
ADD COLUMN IF NOT EXISTS body_condition_score TEXT,
ADD COLUMN IF NOT EXISTS dehydration TEXT,
ADD COLUMN IF NOT EXISTS pain_score TEXT,
ADD COLUMN IF NOT EXISTS mucous_membranes TEXT;