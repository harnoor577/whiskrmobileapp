-- Create reports_generated table for tracking report generation consent
CREATE TABLE public.reports_generated (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  consult_id uuid REFERENCES public.consults(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  report_type text NOT NULL CHECK (report_type IN ('soap', 'wellness', 'procedure')),
  consented_at timestamp with time zone NOT NULL DEFAULT now(),
  ip_address text,
  device_fingerprint text,
  device_name text,
  user_agent text,
  user_email text,
  patient_name text,
  input_mode text,
  transcription_length integer DEFAULT 0,
  uploaded_files_count integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reports_generated ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can insert reports for their clinic"
ON public.reports_generated
FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can view reports in their clinic"
ON public.reports_generated
FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Admins can view all clinic reports"
ON public.reports_generated
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) AND
  clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Super admins can view all reports"
ON public.reports_generated
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Performance indexes
CREATE INDEX idx_reports_generated_clinic_id ON public.reports_generated(clinic_id);
CREATE INDEX idx_reports_generated_user_id ON public.reports_generated(user_id);
CREATE INDEX idx_reports_generated_consult_id ON public.reports_generated(consult_id);
CREATE INDEX idx_reports_generated_report_type ON public.reports_generated(report_type);
CREATE INDEX idx_reports_generated_consented_at ON public.reports_generated(consented_at DESC);