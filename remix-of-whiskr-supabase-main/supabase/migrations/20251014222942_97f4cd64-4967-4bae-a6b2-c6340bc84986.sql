-- Drop the existing check constraint
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_sex_check;

-- Add updated check constraint with form values
ALTER TABLE public.patients ADD CONSTRAINT patients_sex_check 
CHECK (sex IS NULL OR sex IN ('Male', 'Female', 'Male (Neutered)', 'Female (Spayed)', 'Unknown'));