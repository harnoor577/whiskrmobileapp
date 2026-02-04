-- Add patient_id column to file_assets table
ALTER TABLE public.file_assets
ADD COLUMN patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE;

-- Create an index for efficient patient-based queries
CREATE INDEX idx_file_assets_patient_id ON public.file_assets(patient_id);

-- Backfill existing records by looking up patient_id from consults
UPDATE public.file_assets fa
SET patient_id = c.patient_id
FROM public.consults c
WHERE fa.consult_id = c.id
  AND fa.patient_id IS NULL;