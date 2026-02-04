-- Create a unique index on patient_id within identifiers jsonb field per clinic
-- This prevents duplicate patient IDs at the database level
CREATE UNIQUE INDEX unique_patient_id_per_clinic 
ON patients (clinic_id, (identifiers->>'patient_id')) 
WHERE (identifiers->>'patient_id') IS NOT NULL AND (identifiers->>'patient_id') != '';

-- Add a helpful comment
COMMENT ON INDEX unique_patient_id_per_clinic IS 'Ensures each patient ID is unique within a clinic. Empty or null patient IDs are allowed.';