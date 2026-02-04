-- Add subscription and trial tracking to clinics table
ALTER TABLE public.clinics 
ADD COLUMN subscription_status text DEFAULT 'trial',
ADD COLUMN subscription_tier text DEFAULT 'free',
ADD COLUMN trial_ends_at timestamp with time zone DEFAULT (now() + interval '14 days'),
ADD COLUMN stripe_customer_id text,
ADD COLUMN stripe_subscription_id text,
ADD COLUMN max_users integer DEFAULT 3;

-- Create user_invitations table for inviting staff
CREATE TABLE public.user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  email text NOT NULL,
  role app_role NOT NULL DEFAULT 'support_staff',
  invited_by uuid REFERENCES auth.users(id),
  invited_at timestamp with time zone DEFAULT now(),
  accepted_at timestamp with time zone,
  expires_at timestamp with time zone DEFAULT (now() + interval '7 days'),
  status text DEFAULT 'pending',
  UNIQUE(clinic_id, email)
);

-- Enable RLS on user_invitations
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

-- Admins can manage invitations in their clinic
CREATE POLICY "Admins can manage invitations"
ON public.user_invitations
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin') 
  AND clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
);

-- Users can view their own invitations
CREATE POLICY "Users can view their invitations"
ON public.user_invitations
FOR SELECT
TO authenticated
USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Function to check if clinic can add more users
CREATE OR REPLACE FUNCTION public.can_add_user(clinic_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT COUNT(*) FROM public.profiles WHERE clinic_id = clinic_uuid
  ) < (
    SELECT max_users FROM public.clinics WHERE id = clinic_uuid
  );
$$;

-- Function to check if clinic trial has expired
CREATE OR REPLACE FUNCTION public.is_trial_expired(clinic_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN subscription_status = 'trial' AND trial_ends_at < now() THEN true
      ELSE false
    END
  FROM public.clinics 
  WHERE id = clinic_uuid;
$$;