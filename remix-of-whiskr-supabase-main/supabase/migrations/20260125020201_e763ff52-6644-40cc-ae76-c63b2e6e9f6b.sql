-- Add missing column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS unit_preference TEXT DEFAULT 'metric';

-- Create user_invitations table
CREATE TABLE IF NOT EXISTS public.user_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'standard',
  clinic_role TEXT NOT NULL DEFAULT 'vet_tech',
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  invited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMP WITH TIME ZONE,
  token TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on user_invitations
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_invitations
CREATE POLICY "Admins can manage invitations in their clinic" 
ON public.user_invitations 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::app_role) AND 
  clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
);

-- Create compliance_audit_trail view for audit events
CREATE OR REPLACE VIEW public.compliance_audit_trail AS
SELECT 
  ae.id,
  ae.action AS event_type,
  ae.created_at AS event_at,
  p.email AS user_email,
  pat.name AS patient_name,
  c.id AS consult_id,
  ae.details,
  ae.entity_type,
  ae.ip_address
FROM public.audit_events ae
LEFT JOIN public.profiles p ON ae.user_id = p.user_id
LEFT JOIN public.consults c ON ae.entity_type = 'consult' AND ae.entity_id = c.id
LEFT JOIN public.patients pat ON c.patient_id = pat.id
ORDER BY ae.created_at DESC;

-- Add index for user_invitations
CREATE INDEX IF NOT EXISTS idx_user_invitations_clinic_id ON public.user_invitations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON public.user_invitations(email);