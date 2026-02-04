-- Add missing audit and tracking columns to reports_generated
ALTER TABLE public.reports_generated
  ADD COLUMN IF NOT EXISTS patient_id uuid,
  ADD COLUMN IF NOT EXISTS patient_name text,
  ADD COLUMN IF NOT EXISTS consented_at timestamptz,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS device_name text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS user_email text,
  ADD COLUMN IF NOT EXISTS input_mode text,
  ADD COLUMN IF NOT EXISTS transcription_length integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uploaded_files_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS regeneration_reason text,
  ADD COLUMN IF NOT EXISTS regenerated_from uuid,
  ADD COLUMN IF NOT EXISTS version_number integer DEFAULT 1;

-- Add extended wellness columns
ALTER TABLE public.reports_generated
  ADD COLUMN IF NOT EXISTS wellness_visit_header text,
  ADD COLUMN IF NOT EXISTS wellness_vitals text,
  ADD COLUMN IF NOT EXISTS wellness_physical_exam text,
  ADD COLUMN IF NOT EXISTS wellness_vaccines text,
  ADD COLUMN IF NOT EXISTS wellness_preventive_care text,
  ADD COLUMN IF NOT EXISTS wellness_diet_nutrition text,
  ADD COLUMN IF NOT EXISTS wellness_client_education text,
  ADD COLUMN IF NOT EXISTS wellness_clinician_notes text,
  ADD COLUMN IF NOT EXISTS wellness_owner_discussion text;

-- Add extended procedure columns
ALTER TABLE public.reports_generated
  ADD COLUMN IF NOT EXISTS procedure_summary text,
  ADD COLUMN IF NOT EXISTS procedure_pre_assessment text,
  ADD COLUMN IF NOT EXISTS procedure_anesthetic_protocol text,
  ADD COLUMN IF NOT EXISTS procedure_details text,
  ADD COLUMN IF NOT EXISTS procedure_medications text;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_reports_generated_patient_id ON public.reports_generated(patient_id);
CREATE INDEX IF NOT EXISTS idx_reports_generated_consented_at ON public.reports_generated(consented_at);