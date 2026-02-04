-- Add clinic_email column to clinics table
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS clinic_email text;

COMMENT ON COLUMN public.clinics.clinic_email IS 'Primary contact email for the clinic';