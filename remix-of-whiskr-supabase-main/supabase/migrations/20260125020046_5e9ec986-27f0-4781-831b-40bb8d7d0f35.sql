-- Add missing columns to clinics table
ALTER TABLE public.clinics 
ADD COLUMN IF NOT EXISTS payment_failed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS notification_80_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notification_95_sent BOOLEAN DEFAULT false;

-- Add missing column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS name_prefix TEXT;

-- Add missing columns to consults table
ALTER TABLE public.consults 
ADD COLUMN IF NOT EXISTS timeline JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS original_input TEXT,
ADD COLUMN IF NOT EXISTS clinic_location TEXT,
ADD COLUMN IF NOT EXISTS procedure_name TEXT,
ADD COLUMN IF NOT EXISTS procedure_indication TEXT,
ADD COLUMN IF NOT EXISTS procedure_date_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS visit_type TEXT;

-- Add missing columns to support_tickets table
ALTER TABLE public.support_tickets 
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS refund_status TEXT,
ADD COLUMN IF NOT EXISTS payload JSONB;

-- Add missing column to patients table
ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS assigned_vet_id UUID REFERENCES auth.users(id);

-- Create extension_tokens table
CREATE TABLE IF NOT EXISTS public.extension_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on extension_tokens
ALTER TABLE public.extension_tokens ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for extension_tokens
CREATE POLICY "Users can view their own tokens" 
ON public.extension_tokens 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own tokens" 
ON public.extension_tokens 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can revoke their own tokens" 
ON public.extension_tokens 
FOR UPDATE 
USING (user_id = auth.uid());

-- Create consult_usage_notifications table
CREATE TABLE IF NOT EXISTS public.consult_usage_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  threshold_percentage INTEGER NOT NULL,
  consults_at_notification INTEGER NOT NULL,
  consults_cap INTEGER NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  email_sent_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS on consult_usage_notifications
ALTER TABLE public.consult_usage_notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for consult_usage_notifications
CREATE POLICY "Users can view their clinic notifications" 
ON public.consult_usage_notifications 
FOR SELECT 
USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

-- Create user_templates table
CREATE TABLE IF NOT EXISTS public.user_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  system_template_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('soap', 'wellness', 'procedure')),
  name TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on user_templates
ALTER TABLE public.user_templates ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_templates
CREATE POLICY "Users can manage their own templates" 
ON public.user_templates 
FOR ALL 
USING (user_id = auth.uid());

-- Create login_history table
CREATE TABLE IF NOT EXISTS public.login_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  device_name TEXT,
  device_fingerprint TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on login_history
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for login_history
CREATE POLICY "Users can view their own login history" 
ON public.login_history 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own login history" 
ON public.login_history 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- Create reports_generated table for audit logging
CREATE TABLE IF NOT EXISTS public.reports_generated (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  consult_id UUID REFERENCES public.consults(id) ON DELETE SET NULL,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- SOAP fields
  soap_s TEXT,
  soap_o TEXT,
  soap_a TEXT,
  soap_p TEXT,
  -- Wellness fields
  wellness_summary TEXT,
  wellness_findings TEXT,
  wellness_recommendations TEXT,
  -- Procedure fields
  procedure_name TEXT,
  procedure_indication TEXT,
  procedure_pre_status TEXT,
  procedure_post_status TEXT,
  procedure_follow_up TEXT,
  procedure_client_comm TEXT,
  procedure_email_to_client TEXT
);

-- Enable RLS on reports_generated
ALTER TABLE public.reports_generated ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for reports_generated
CREATE POLICY "Users can view their clinic reports" 
ON public.reports_generated 
FOR SELECT 
USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert reports" 
ON public.reports_generated 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- Create update_consult_history_metadata function
CREATE OR REPLACE FUNCTION public.update_consult_history_metadata(
  p_consult_id UUID,
  p_ip_address TEXT,
  p_device_fingerprint TEXT,
  p_device_name TEXT,
  p_user_agent TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- This is a placeholder function for metadata updates
  -- The actual implementation depends on consult_history table structure
  NULL;
END;
$$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_extension_tokens_user_id ON public.extension_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_templates_user_id ON public.user_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON public.login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_generated_clinic_id ON public.reports_generated(clinic_id);
CREATE INDEX IF NOT EXISTS idx_reports_generated_consult_id ON public.reports_generated(consult_id);
CREATE INDEX IF NOT EXISTS idx_consult_usage_notifications_clinic_id ON public.consult_usage_notifications(clinic_id);