-- Add assigned_vet_id column to patients table
ALTER TABLE public.patients 
ADD COLUMN assigned_vet_id UUID;

-- Create index for performance
CREATE INDEX idx_patients_assigned_vet_id ON public.patients(assigned_vet_id);