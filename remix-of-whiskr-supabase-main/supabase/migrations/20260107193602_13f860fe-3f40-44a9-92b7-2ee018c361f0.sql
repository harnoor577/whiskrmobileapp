-- Create user_templates table for customizable templates
CREATE TABLE public.user_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  system_template_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('soap', 'wellness', 'procedure')),
  name TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint for one active template per type per user
CREATE UNIQUE INDEX idx_user_templates_active_type 
ON public.user_templates (user_id, type) 
WHERE is_active = true;

-- Create index for faster lookups
CREATE INDEX idx_user_templates_user_clinic ON public.user_templates (user_id, clinic_id);
CREATE INDEX idx_user_templates_type ON public.user_templates (type);

-- Enable RLS
ALTER TABLE public.user_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own templates
CREATE POLICY "Users can view their own templates"
ON public.user_templates
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own templates"
ON public.user_templates
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates"
ON public.user_templates
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates"
ON public.user_templates
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger to update updated_at
CREATE TRIGGER update_user_templates_updated_at
BEFORE UPDATE ON public.user_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();