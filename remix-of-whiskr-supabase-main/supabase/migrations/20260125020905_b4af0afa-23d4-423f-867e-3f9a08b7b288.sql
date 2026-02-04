-- Add missing columns to patients table
ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS age TEXT,
ADD COLUMN IF NOT EXISTS weight_kg NUMERIC,
ADD COLUMN IF NOT EXISTS weight_lb NUMERIC;

-- Add missing columns to consults table
ALTER TABLE public.consults
ADD COLUMN IF NOT EXISTS discharge_summary TEXT,
ADD COLUMN IF NOT EXISTS regen_status TEXT;

-- Add missing columns to login_history table (rename created_at concept for login_time)
ALTER TABLE public.login_history
ADD COLUMN IF NOT EXISTS login_time TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- Backfill login_time from created_at for existing records
UPDATE public.login_history SET login_time = created_at WHERE login_time IS NULL;