-- Add case_notes_history to track individual notes with metadata
CREATE TABLE IF NOT EXISTS public.case_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consult_id UUID NOT NULL REFERENCES public.consults(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;

-- Users can view case notes in their clinic
CREATE POLICY "Users can view case notes in their clinic"
  ON public.case_notes
  FOR SELECT
  USING (clinic_id IN (
    SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
  ));

-- Staff with edit permissions can create case notes
CREATE POLICY "Staff with edit permissions can create case notes"
  ON public.case_notes
  FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
    )
    AND can_edit_clinical_data(auth.uid(), clinic_id)
  );

-- Staff with edit permissions can update their own case notes
CREATE POLICY "Staff with edit permissions can update case notes"
  ON public.case_notes
  FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
    )
    AND can_edit_clinical_data(auth.uid(), clinic_id)
  );

-- Create index for faster lookups
CREATE INDEX idx_case_notes_consult_id ON public.case_notes(consult_id);
CREATE INDEX idx_case_notes_created_at ON public.case_notes(created_at DESC);

-- Add trigger for updated_at
CREATE TRIGGER update_case_notes_updated_at
  BEFORE UPDATE ON public.case_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();