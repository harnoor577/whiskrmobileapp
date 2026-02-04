-- Create visit_logs table for receptionist data entry
CREATE TABLE public.visit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  presenting_complaint TEXT,
  weight_kg NUMERIC,
  weight_lb NUMERIC,
  recorded_by UUID NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.visit_logs ENABLE ROW LEVEL SECURITY;

-- Receptionists, vet techs, and vets can create visit logs
CREATE POLICY "Clinic staff can create visit logs"
ON public.visit_logs
FOR INSERT
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
  AND recorded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.clinic_roles
    WHERE user_id = auth.uid()
      AND clinic_id = visit_logs.clinic_id
      AND role IN ('receptionist'::clinic_role, 'vet_tech'::clinic_role, 'vet'::clinic_role)
  )
);

-- Users can view visit logs in their clinic
CREATE POLICY "Users can view visit logs in their clinic"
ON public.visit_logs
FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
);

-- Super admins can view all visit logs
CREATE POLICY "Super admins can view all visit logs"
ON public.visit_logs
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Create indexes for performance
CREATE INDEX idx_visit_logs_patient_id ON public.visit_logs(patient_id);
CREATE INDEX idx_visit_logs_clinic_id ON public.visit_logs(clinic_id);
CREATE INDEX idx_visit_logs_recorded_at ON public.visit_logs(recorded_at DESC);

-- Add trigger for weight sync (similar to patients/consults tables)
CREATE TRIGGER sync_visit_log_weight
BEFORE INSERT OR UPDATE ON public.visit_logs
FOR EACH ROW
EXECUTE FUNCTION public.sync_patient_weight();