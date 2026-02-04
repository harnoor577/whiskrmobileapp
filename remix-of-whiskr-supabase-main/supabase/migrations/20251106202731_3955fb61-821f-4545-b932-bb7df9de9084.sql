-- Create vaccines_administered table for tracking vaccine administration
CREATE TABLE IF NOT EXISTS public.vaccines_administered (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consult_id UUID NOT NULL REFERENCES public.consults(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  vaccine_name TEXT NOT NULL,
  vaccine_type TEXT CHECK (vaccine_type IN ('core', 'non_core')),
  dose TEXT,
  route TEXT,
  site TEXT,
  manufacturer TEXT,
  lot_number TEXT,
  expiry_date DATE,
  vis_given BOOLEAN DEFAULT false,
  administered_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  administered_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on vaccines_administered
ALTER TABLE public.vaccines_administered ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vaccines_administered
CREATE POLICY "Users can view vaccines in their clinic"
  ON public.vaccines_administered FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "DVMs can insert vaccines"
  ON public.vaccines_administered FOR INSERT
  WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
    AND is_dvm_role(auth.uid(), clinic_id)
  );

CREATE POLICY "DVMs can update vaccines"
  ON public.vaccines_administered FOR UPDATE
  USING (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
    AND is_dvm_role(auth.uid(), clinic_id)
  );

-- Add wellness-specific fields to consults table
ALTER TABLE public.consults
  ADD COLUMN IF NOT EXISTS preventive_care_plan JSONB,
  ADD COLUMN IF NOT EXISTS next_vaccines_due JSONB,
  ADD COLUMN IF NOT EXISTS next_wellness_due DATE,
  ADD COLUMN IF NOT EXISTS dental_notes TEXT,
  ADD COLUMN IF NOT EXISTS nutrition_plan JSONB,
  ADD COLUMN IF NOT EXISTS parasite_prevention JSONB;

-- Create wellness_templates table
CREATE TABLE IF NOT EXISTS public.wellness_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id),
  name TEXT NOT NULL,
  template_data JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.wellness_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view wellness templates"
  ON public.wellness_templates FOR SELECT
  USING (clinic_id IS NULL OR clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage clinic wellness templates"
  ON public.wellness_templates FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Seed AAHA default template
INSERT INTO public.wellness_templates (clinic_id, name, template_data, is_active)
VALUES (
  NULL,
  'AAHA Default',
  '{
    "sections": [
      {"id": "header", "enabled": true, "order": 1},
      {"id": "history", "enabled": true, "order": 2},
      {"id": "pre_vaccine_checklist", "enabled": true, "order": 3},
      {"id": "vitals_pe", "enabled": true, "order": 4},
      {"id": "vaccines", "enabled": true, "order": 5},
      {"id": "aaha_preventive_care", "enabled": true, "order": 6},
      {"id": "discharge_instructions", "enabled": true, "order": 7},
      {"id": "next_due", "enabled": true, "order": 8},
      {"id": "client_education", "enabled": true, "order": 9},
      {"id": "signature", "enabled": true, "order": 10}
    ],
    "custom_sections": []
  }'::jsonb,
  true
)
ON CONFLICT DO NOTHING;

-- Add wellness template preference to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_wellness_template_id UUID REFERENCES public.wellness_templates(id);

-- Create species_normal_ranges table
CREATE TABLE IF NOT EXISTS public.species_normal_ranges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  species TEXT NOT NULL,
  breed TEXT,
  age_class TEXT CHECK (age_class IN ('puppy', 'kitten', 'adult', 'senior')),
  parameter TEXT NOT NULL,
  min_value NUMERIC,
  max_value NUMERIC,
  unit TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.species_normal_ranges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view normal ranges"
  ON public.species_normal_ranges FOR SELECT
  USING (true);

-- Seed common species normal ranges
INSERT INTO public.species_normal_ranges (species, breed, age_class, parameter, min_value, max_value, unit, notes)
VALUES
  -- Dogs - General
  ('Dog', NULL, 'adult', 'heart_rate', 70, 120, 'bpm', 'Varies by breed size'),
  ('Dog', NULL, 'adult', 'temperature', 101.0, 102.5, '°F', NULL),
  ('Dog', NULL, 'adult', 'respiratory_rate', 10, 35, 'breaths/min', NULL),
  ('Dog', NULL, 'puppy', 'heart_rate', 100, 180, 'bpm', NULL),
  ('Dog', NULL, 'senior', 'heart_rate', 70, 110, 'bpm', NULL),
  
  -- Cats - General
  ('Cat', NULL, 'adult', 'heart_rate', 140, 220, 'bpm', NULL),
  ('Cat', NULL, 'adult', 'temperature', 100.5, 102.5, '°F', NULL),
  ('Cat', NULL, 'adult', 'respiratory_rate', 20, 40, 'breaths/min', NULL),
  ('Cat', NULL, 'kitten', 'heart_rate', 200, 260, 'bpm', NULL),
  ('Cat', NULL, 'senior', 'heart_rate', 120, 200, 'bpm', NULL),
  
  -- Dogs - Breed specific
  ('Dog', 'Labrador Retriever', 'adult', 'heart_rate', 70, 120, 'bpm', NULL),
  ('Dog', 'Golden Retriever', 'adult', 'heart_rate', 70, 120, 'bpm', NULL),
  ('Dog', 'German Shepherd', 'adult', 'heart_rate', 70, 120, 'bpm', NULL),
  ('Dog', 'Chihuahua', 'adult', 'heart_rate', 100, 140, 'bpm', 'Small breed'),
  ('Dog', 'Great Dane', 'adult', 'heart_rate', 60, 100, 'bpm', 'Giant breed')
ON CONFLICT DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_vaccines_administered_consult ON public.vaccines_administered(consult_id);
CREATE INDEX IF NOT EXISTS idx_vaccines_administered_clinic ON public.vaccines_administered(clinic_id);
CREATE INDEX IF NOT EXISTS idx_vaccines_administered_patient ON public.vaccines_administered(patient_id);
CREATE INDEX IF NOT EXISTS idx_species_normal_ranges_lookup ON public.species_normal_ranges(species, breed, age_class, parameter);

-- Add trigger for updated_at on vaccines_administered
CREATE TRIGGER update_vaccines_administered_updated_at
  BEFORE UPDATE ON public.vaccines_administered
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();