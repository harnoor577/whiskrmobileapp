-- Add complimentary trial tracking to clinics
ALTER TABLE public.clinics
ADD COLUMN IF NOT EXISTS complimentary_trial_granted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS complimentary_trial_granted_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS complimentary_trial_granted_at TIMESTAMP WITH TIME ZONE;

-- Create master_admin_notes table for super admins to track clinic notes
CREATE TABLE IF NOT EXISTS public.master_admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  note TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.master_admin_notes ENABLE ROW LEVEL SECURITY;

-- Super admins can manage all notes
CREATE POLICY "Super admins can manage notes"
ON public.master_admin_notes
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Function to grant complimentary trial (super admin only)
CREATE OR REPLACE FUNCTION public.grant_complimentary_trial(
  clinic_uuid UUID,
  trial_days INTEGER DEFAULT 30
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is super admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super admins can grant complimentary trials';
  END IF;
  
  UPDATE public.clinics
  SET 
    subscription_status = 'trial',
    trial_ends_at = now() + (trial_days || ' days')::interval,
    complimentary_trial_granted = true,
    complimentary_trial_granted_by = auth.uid(),
    complimentary_trial_granted_at = now()
  WHERE id = clinic_uuid;
END;
$$;

-- Update RLS policies to allow super admins to view all data
CREATE POLICY "Super admins can view all clinics"
ON public.clinics
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can view all consults"
ON public.consults
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can view all patients"
ON public.patients
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Update audit events to allow super admins
CREATE POLICY "Super admins can view all audit events"
ON public.audit_events
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));