-- Create consult_assignments table to track user assignments
CREATE TABLE IF NOT EXISTS public.consult_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consult_id UUID NOT NULL REFERENCES public.consults(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(consult_id, user_id)
);

-- Enable RLS
ALTER TABLE public.consult_assignments ENABLE ROW LEVEL SECURITY;

-- Policies for consult_assignments
CREATE POLICY "Users can view assignments in their clinic"
  ON public.consult_assignments
  FOR SELECT
  USING (
    consult_id IN (
      SELECT id FROM public.consults WHERE clinic_id IN (
        SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins and vets can assign users"
  ON public.consult_assignments
  FOR INSERT
  WITH CHECK (
    consult_id IN (
      SELECT id FROM public.consults WHERE clinic_id IN (
        SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
      )
    )
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'veterinarian'::app_role))
  );

CREATE POLICY "Admins and vets can remove assignments"
  ON public.consult_assignments
  FOR DELETE
  USING (
    consult_id IN (
      SELECT id FROM public.consults WHERE clinic_id IN (
        SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
      )
    )
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'veterinarian'::app_role))
  );

-- Add index for performance
CREATE INDEX idx_consult_assignments_consult_id ON public.consult_assignments(consult_id);
CREATE INDEX idx_consult_assignments_user_id ON public.consult_assignments(user_id);