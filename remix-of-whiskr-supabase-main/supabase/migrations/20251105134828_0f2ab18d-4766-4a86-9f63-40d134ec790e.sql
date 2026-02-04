-- Add weight fields to patients table (if not exists)
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(6,2),
ADD COLUMN IF NOT EXISTS weight_lb NUMERIC(6,2);

-- Triggers already exist, no need to recreate them
-- The sync_patient_weight() and sync_consult_weight() functions are already in place