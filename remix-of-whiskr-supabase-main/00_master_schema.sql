-- ============================================================================
-- OURA VET AI - Master Database Schema
-- ============================================================================
-- This file recreates the complete database schema for the Oura Vet AI platform.
-- Run this in a fresh Lovable Cloud project after remixing to duplicate the database.
--
-- Contents:
-- 1. Custom Types & Enums
-- 2. Core Tables (Clinics, Profiles, Roles)
-- 3. Clinical Data (Patients, Owners, Consults)
-- 4. Features (Diagnostics, Tasks, Messages, Notifications)
-- 5. Support & Admin (Tickets, Audit, Device Sessions)
-- 6. Referral & Billing (Referrals, Credits)
-- 7. Security Functions & RLS Policies
-- 8. Triggers & Automation
-- 9. Indexes for Performance
-- ============================================================================

-- ============================================================================
-- PART 1: CUSTOM TYPES & ENUMS
-- ============================================================================

-- Application-level roles (for account/billing access)
CREATE TYPE public.app_role AS ENUM ('admin', 'standard', 'super_admin');

-- Clinic-level roles (for day-to-day work)
CREATE TYPE public.clinic_role AS ENUM ('vet', 'vet_tech', 'receptionist');

-- ============================================================================
-- PART 2: CORE TABLES - CLINICS, PROFILES, ROLES
-- ============================================================================

-- Clinics table (organizations/practices)
CREATE TABLE public.clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  header_logo_url TEXT,
  address TEXT,
  phone TEXT,
  clinic_email TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  data_residency TEXT DEFAULT 'us' CHECK (data_residency IN ('us', 'ca')),
  retention_days INTEGER DEFAULT 90,
  brand_colors JSONB DEFAULT '{"primary": "#1E40AF", "secondary": "#059669"}'::jsonb,
  
  -- Subscription & billing
  subscription_status TEXT DEFAULT 'trial',
  subscription_tier TEXT DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '14 days'),
  billing_cycle_start_date DATE DEFAULT CURRENT_DATE,
  
  -- Usage & limits
  max_users INTEGER DEFAULT 3,
  max_devices INTEGER DEFAULT 3,
  consults_cap INTEGER DEFAULT 50,
  trial_consults_cap INTEGER DEFAULT 25,
  consults_used_this_period INTEGER DEFAULT 0,
  
  -- Complimentary trial tracking
  complimentary_trial_granted BOOLEAN DEFAULT false,
  complimentary_trial_granted_by UUID,
  complimentary_trial_granted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User profiles (one per user, links to auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  last_login_at TIMESTAMPTZ,
  mfa_enabled BOOLEAN DEFAULT false,
  
  -- Optional profile fields
  user_type TEXT,
  dvm_role TEXT,
  country TEXT,
  state_province TEXT,
  city TEXT,
  school_name TEXT,
  practice_types TEXT[],
  user_tags TEXT[],
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Application-level roles (admin, standard, super_admin)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Clinic-level roles (vet, vet_tech, receptionist)
CREATE TABLE public.clinic_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  role public.clinic_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, clinic_id, role)
);

-- ============================================================================
-- PART 3: CLINICAL DATA - PATIENTS, OWNERS, CONSULTS
-- ============================================================================

-- Pet owners
CREATE TABLE public.owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Patients (animals)
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  owner_id UUID NOT NULL REFERENCES public.owners(id),
  name TEXT NOT NULL,
  species TEXT NOT NULL,
  breed TEXT,
  sex TEXT,
  date_of_birth DATE,
  alerts TEXT,
  identifiers JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consults (visits/appointments)
CREATE TABLE public.consults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  owner_id UUID NOT NULL REFERENCES public.owners(id),
  vet_user_id UUID REFERENCES auth.users(id),
  
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed', 'finalized')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_sec INTEGER,
  
  -- Clinical notes
  reason_for_visit TEXT,
  history_summary TEXT,
  soap_s TEXT,  -- Subjective
  soap_o TEXT,  -- Objective
  soap_a TEXT,  -- Assessment
  soap_p TEXT,  -- Plan
  case_notes TEXT,
  final_treatment_plan TEXT,
  final_summary TEXT,
  
  -- Metadata
  version INTEGER DEFAULT 1,
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES auth.users(id),
  plan_locked BOOLEAN DEFAULT false,
  transcription_method TEXT,
  audio_duration_seconds INTEGER DEFAULT 0,
  transcription_confidence NUMERIC,
  last_analysis_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consult assignments (who's working on this consult)
CREATE TABLE public.consult_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consult_id UUID NOT NULL REFERENCES public.consults(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(consult_id, user_id)
);

-- Audio transcription segments
CREATE TABLE public.consult_audio_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  consult_id UUID REFERENCES public.consults(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  sequence_number INTEGER NOT NULL,
  transcription TEXT NOT NULL,
  duration_seconds INTEGER,
  confidence NUMERIC,
  method TEXT DEFAULT 'cloud',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Case notes (clinical observations)
CREATE TABLE public.case_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  consult_id UUID NOT NULL REFERENCES public.consults(id),
  note TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- PART 4: FEATURES - DIAGNOSTICS, TASKS, MESSAGES, NOTIFICATIONS
-- ============================================================================

-- File assets (diagnostic images, documents)
CREATE TABLE public.file_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  consult_id UUID REFERENCES public.consults(id),
  storage_key TEXT NOT NULL,
  type TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  document_type TEXT,
  modality TEXT,
  ocr_text TEXT,
  analysis_json JSONB,
  confidence NUMERIC,
  pdf_path TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tasks (follow-ups, reminders)
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  consult_id UUID REFERENCES public.consults(id),
  title TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  source TEXT DEFAULT 'manual' CHECK (source IN ('ai', 'manual')),
  due_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Internal messages between staff
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  recipient_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  action_url TEXT,
  consult_id UUID REFERENCES public.consults(id),
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chat messages (AI assistant conversations)
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  consult_id UUID REFERENCES public.consults(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  sender_name TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI feedback collection
CREATE TABLE public.ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  consult_id UUID REFERENCES public.consults(id),
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('thumbs_up', 'thumbs_down')),
  content_type TEXT NOT NULL,
  content_text TEXT NOT NULL,
  feedback_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- PART 5: SUPPORT & ADMIN - TICKETS, AUDIT, DEVICE SESSIONS
-- ============================================================================

-- Support tickets
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_to UUID REFERENCES auth.users(id),
  related_consult_id UUID REFERENCES public.consults(id),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Support ticket replies
CREATE TABLE public.support_ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  message TEXT NOT NULL,
  is_support_reply BOOLEAN DEFAULT false,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Support ticket read tracking
CREATE TABLE public.support_ticket_reads (
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, user_id)
);

-- Support agents (staff who can respond to tickets)
CREATE TABLE public.support_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit events (compliance logging)
CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Device sessions (device limit enforcement)
CREATE TABLE public.device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  device_fingerprint TEXT NOT NULL,
  device_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  revoked BOOLEAN NOT NULL DEFAULT false,
  revoked_by UUID REFERENCES auth.users(id),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Push notification subscriptions
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- PART 6: REFERRAL & BILLING
-- ============================================================================

-- Referral codes
CREATE TABLE public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  inviter_name TEXT,
  uses_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Referrals tracking
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id),
  referred_user_id UUID NOT NULL REFERENCES auth.users(id),
  referral_code TEXT NOT NULL,
  inviter_name TEXT,
  credit_amount NUMERIC DEFAULT 50.00,
  credit_awarded BOOLEAN NOT NULL DEFAULT false,
  signed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  became_paying_at TIMESTAMPTZ
);

-- User credits (from referrals)
CREATE TABLE public.user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  amount NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  referral_id UUID REFERENCES public.referrals(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Integration sync status
CREATE TABLE public.integration_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  consult_id UUID NOT NULL REFERENCES public.consults(id),
  target TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  response JSONB,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- PART 7: MASTER ADMIN MFA TABLES
-- ============================================================================

-- Master admin OTPs
CREATE TABLE public.master_admin_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ
);

-- Master admin backup codes
CREATE TABLE public.master_admin_backup_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ
);

-- Master admin notes (super admin can leave notes on clinics)
CREATE TABLE public.master_admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Rate limiting table
CREATE TABLE public.rate_limit_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  action TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  lockout_level INTEGER DEFAULT 0,
  lockout_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(identifier, action)
);

-- ============================================================================
-- PART 8: SECURITY FUNCTIONS
-- ============================================================================

-- Check if user has app-level role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if user has clinic-level role
CREATE OR REPLACE FUNCTION public.has_clinic_role(_user_id UUID, _clinic_id UUID, _role clinic_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_roles
    WHERE user_id = _user_id
      AND clinic_id = _clinic_id
      AND role = _role
  )
$$;

-- Check if user can edit clinical data (vet or vet_tech)
CREATE OR REPLACE FUNCTION public.can_edit_clinical_data(_user_id UUID, _clinic_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_roles
    WHERE user_id = _user_id
      AND clinic_id = _clinic_id
      AND role IN ('vet'::clinic_role, 'vet_tech'::clinic_role)
  )
$$;

-- Get user's clinic ID
CREATE OR REPLACE FUNCTION public.get_user_clinic_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Get current user email
CREATE OR REPLACE FUNCTION public.get_current_user_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Count active devices for clinic
CREATE OR REPLACE FUNCTION public.count_active_devices(_clinic_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT device_fingerprint)::integer
  FROM public.device_sessions
  WHERE clinic_id = _clinic_id
    AND NOT revoked
    AND last_active_at > now() - interval '7 days';
$$;

-- Count active devices for user
CREATE OR REPLACE FUNCTION public.count_user_active_devices(_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.device_sessions
  WHERE user_id = _user_id
    AND NOT revoked
    AND last_active_at > now() - interval '7 days';
$$;

-- Check if trial expired
CREATE OR REPLACE FUNCTION public.is_trial_expired(clinic_uuid UUID)
RETURNS BOOLEAN
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

-- Check if consult cap reached
CREATE OR REPLACE FUNCTION public.has_reached_consult_cap(clinic_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN subscription_tier = 'enterprise' THEN false
      WHEN subscription_status = 'trial' THEN consults_used_this_period >= trial_consults_cap
      ELSE consults_used_this_period >= consults_cap
    END
  FROM public.clinics 
  WHERE id = clinic_uuid;
$$;

-- Check if clinic can add more users
CREATE OR REPLACE FUNCTION public.can_add_user(clinic_uuid UUID)
RETURNS BOOLEAN
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

-- Get user total credits
CREATE OR REPLACE FUNCTION public.get_user_total_credits(user_uuid UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount), 0) FROM public.user_credits WHERE user_id = user_uuid;
$$;

-- Get patient identifier from JSONB
CREATE OR REPLACE FUNCTION public.get_patient_identifier(identifiers JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(identifiers->>'patient_id', '');
$$;

-- Check if master admin requires MFA
CREATE OR REPLACE FUNCTION public.check_requires_mfa(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles p
    JOIN public.user_roles ur ON p.user_id = ur.user_id
    WHERE LOWER(p.email) = LOWER(p_email)
      AND ur.role = 'super_admin'::app_role
  );
$$;

-- Verify master admin OTP
CREATE OR REPLACE FUNCTION public.verify_master_admin_otp(p_email TEXT, p_otp TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_valid BOOLEAN := false;
BEGIN
  UPDATE public.master_admin_otps
  SET used = true, used_at = now()
  WHERE email = p_email
    AND otp_code = p_otp
    AND NOT used
    AND expires_at > now()
  RETURNING true INTO v_valid;
  
  RETURN COALESCE(v_valid, false);
END;
$$;

-- Verify master admin backup code
CREATE OR REPLACE FUNCTION public.verify_master_admin_backup_code(p_email TEXT, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_valid BOOLEAN := false;
BEGIN
  UPDATE public.master_admin_backup_codes
  SET used = true, used_at = now()
  WHERE email = p_email
    AND code = p_code
    AND NOT used
  RETURNING true INTO v_valid;
  
  RETURN COALESCE(v_valid, false);
END;
$$;

-- Generate master admin backup codes
CREATE OR REPLACE FUNCTION public.generate_master_admin_backup_codes(p_email TEXT)
RETURNS TABLE(code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.master_admin_backup_codes
  WHERE email = p_email AND NOT used;
  
  RETURN QUERY
  INSERT INTO public.master_admin_backup_codes (email, code)
  SELECT 
    p_email,
    substring(md5(random()::text || clock_timestamp()::text) from 1 for 12)
  FROM generate_series(1, 10)
  RETURNING master_admin_backup_codes.code;
END;
$$;

-- Super admin functions for trial/consult management
CREATE OR REPLACE FUNCTION public.add_trial_days(clinic_uuid UUID, days_to_add INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super admins can add trial days';
  END IF;
  
  UPDATE public.clinics
  SET trial_ends_at = COALESCE(trial_ends_at, now()) + (days_to_add || ' days')::interval
  WHERE id = clinic_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_complimentary_trial(clinic_uuid UUID, trial_days INTEGER DEFAULT 30)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION public.add_consults_to_cap(clinic_uuid UUID, additional_consults INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super admins can add consults';
  END IF;
  
  UPDATE public.clinics
  SET 
    trial_consults_cap = CASE 
      WHEN subscription_status = 'trial' THEN trial_consults_cap + additional_consults
      ELSE trial_consults_cap
    END,
    consults_cap = CASE 
      WHEN subscription_status != 'trial' THEN consults_cap + additional_consults
      ELSE consults_cap
    END
  WHERE id = clinic_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_master_admin_account(p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super admins can unlock accounts';
  END IF;

  UPDATE public.rate_limit_attempts
  SET locked_until = NULL,
      lockout_reason = NULL,
      lockout_level = 0
  WHERE identifier = p_email
    AND locked_until > NOW();
END;
$$;

-- Grant super admin to specific email
CREATE OR REPLACE FUNCTION public.grant_super_admin_to_email(email_address TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  SELECT user_id INTO target_user_id
  FROM public.profiles
  WHERE email = email_address
  LIMIT 1;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', email_address;
  END IF;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'super_admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Delete consult cascade
CREATE OR REPLACE FUNCTION public.delete_consult_cascade(_consult_id UUID, _clinic_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.consults c
    WHERE c.id = _consult_id 
    AND c.clinic_id = _clinic_id
    AND c.clinic_id IN (
      SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Consult not found or access denied';
  END IF;

  DELETE FROM public.chat_messages WHERE consult_id = _consult_id;
  DELETE FROM public.consults WHERE id = _consult_id;
  
  INSERT INTO public.audit_events (clinic_id, user_id, action, entity_type, entity_id, details)
  VALUES (
    _clinic_id,
    auth.uid(),
    'delete',
    'consult',
    _consult_id,
    jsonb_build_object('deleted_at', now())
  );
END;
$$;

-- Delete patient cascade
CREATE OR REPLACE FUNCTION public.delete_patient_cascade(_patient_id UUID, _clinic_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = _patient_id 
    AND p.clinic_id = _clinic_id
    AND p.clinic_id IN (
      SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Patient not found or access denied';
  END IF;

  DELETE FROM public.chat_messages 
  WHERE consult_id IN (
    SELECT id FROM public.consults WHERE patient_id = _patient_id
  );
  
  DELETE FROM public.consults WHERE patient_id = _patient_id;
  DELETE FROM public.patients WHERE id = _patient_id;
  
  INSERT INTO public.audit_events (clinic_id, user_id, action, entity_type, entity_id, details)
  VALUES (
    _clinic_id,
    auth.uid(),
    'delete',
    'patient',
    _patient_id,
    jsonb_build_object('deleted_at', now())
  );
END;
$$;

-- Find duplicate patient IDs
CREATE OR REPLACE FUNCTION public.find_duplicate_patient_ids(clinic_uuid UUID DEFAULT NULL)
RETURNS TABLE(clinic_id UUID, patient_id TEXT, duplicate_count BIGINT, patient_ids UUID[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.clinic_id,
    p.identifiers->>'patient_id' as patient_id,
    COUNT(*) as duplicate_count,
    ARRAY_AGG(p.id) as patient_ids
  FROM public.patients p
  WHERE (p.identifiers->>'patient_id') IS NOT NULL
    AND (p.identifiers->>'patient_id') != ''
    AND (clinic_uuid IS NULL OR p.clinic_id = clinic_uuid)
  GROUP BY p.clinic_id, p.identifiers->>'patient_id'
  HAVING COUNT(*) > 1
  ORDER BY duplicate_count DESC;
$$;

-- Cleanup functions
CREATE OR REPLACE FUNCTION public.cleanup_stale_devices()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.device_sessions
  SET revoked = true,
      revoked_at = now()
  WHERE last_active_at < now() - interval '30 days'
    AND NOT revoked;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.master_admin_otps
  WHERE expires_at < now() - interval '1 hour';
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limit_attempts
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$;

-- ============================================================================
-- PART 9: TRIGGERS & AUTOMATION
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Increment consult count
CREATE OR REPLACE FUNCTION public.increment_consult_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clinics
  SET consults_used_this_period = consults_used_this_period + 1
  WHERE id = NEW.clinic_id;
  
  RETURN NEW;
END;
$$;

-- Notify on support reply
CREATE OR REPLACE FUNCTION public.notify_support_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket_record public.support_tickets%ROWTYPE;
BEGIN
  IF NEW.is_support_reply THEN
    SELECT * INTO ticket_record FROM public.support_tickets WHERE id = NEW.ticket_id;
    IF ticket_record.user_id IS NOT NULL AND ticket_record.user_id <> NEW.user_id THEN
      INSERT INTO public.notifications (
        user_id,
        clinic_id,
        type,
        priority,
        title,
        description,
        action_url,
        consult_id
      ) VALUES (
        ticket_record.user_id,
        ticket_record.clinic_id,
        'support',
        'high',
        'Support Reply Received',
        'A support agent replied to your ticket: ' || ticket_record.subject,
        '/support',
        NULL
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Check duplicate patient ID
CREATE OR REPLACE FUNCTION public.check_duplicate_patient_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  patient_id_value TEXT;
  duplicate_count INTEGER;
BEGIN
  patient_id_value := NEW.identifiers->>'patient_id';
  
  IF patient_id_value IS NOT NULL AND patient_id_value != '' THEN
    SELECT COUNT(*) INTO duplicate_count
    FROM public.patients
    WHERE clinic_id = NEW.clinic_id
      AND identifiers->>'patient_id' = patient_id_value
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    
    IF duplicate_count > 0 THEN
      RAISE EXCEPTION 'Patient ID "%" already exists in this clinic', patient_id_value;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Grant super admin to specific user on signup
CREATE OR REPLACE FUNCTION public.grant_super_admin_to_specific_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'bbal@growdvm.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_clinic_id UUID;
  trial_days INTEGER;
  trial_cap INTEGER;
BEGIN
  trial_days := COALESCE((NEW.raw_user_meta_data->>'trial_days')::integer, 7);
  trial_cap := COALESCE((NEW.raw_user_meta_data->>'trial_consults_cap')::integer, 25);
  
  IF trial_cap > 50 THEN
    trial_cap := 50;
  END IF;
  
  INSERT INTO public.clinics (
    name, 
    phone, 
    address, 
    trial_ends_at, 
    trial_consults_cap,
    billing_cycle_start_date,
    subscription_tier
  )
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'clinic_name', 'My Clinic'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    '',
    now() + (trial_days || ' days')::interval,
    trial_cap,
    CURRENT_DATE,
    'basic'
  )
  RETURNING id INTO new_clinic_id;

  INSERT INTO public.profiles (user_id, clinic_id, name, email, phone)
  VALUES (
    NEW.id,
    new_clinic_id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin'::app_role);

  INSERT INTO public.clinic_roles (user_id, clinic_id, role)
  VALUES (NEW.id, new_clinic_id, 'vet'::clinic_role);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_new_user: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER update_clinics_updated_at BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_owners_updated_at BEFORE UPDATE ON public.owners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_consults_updated_at BEFORE UPDATE ON public.consults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_feedback_updated_at BEFORE UPDATE ON public.ai_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_case_notes_updated_at BEFORE UPDATE ON public.case_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_master_admin_notes_updated_at BEFORE UPDATE ON public.master_admin_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rate_limit_attempts_updated_at BEFORE UPDATE ON public.rate_limit_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER increment_consult_count_trigger AFTER INSERT ON public.consults
  FOR EACH ROW EXECUTE FUNCTION public.increment_consult_count();

CREATE TRIGGER notify_support_reply_trigger AFTER INSERT ON public.support_ticket_replies
  FOR EACH ROW EXECUTE FUNCTION public.notify_support_reply();

CREATE TRIGGER check_duplicate_patient_id_trigger BEFORE INSERT OR UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.check_duplicate_patient_id();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- PART 10: ROW-LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consult_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consult_audio_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_admin_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_admin_backup_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_admin_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_attempts ENABLE ROW LEVEL SECURITY;

-- Clinics policies
CREATE POLICY "Users can view their clinic" ON public.clinics
  FOR SELECT USING (id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can update their clinic" ON public.clinics
  FOR UPDATE USING (
    has_role(auth.uid(), 'admin'::app_role) AND
    id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Super admins can view all clinics" ON public.clinics
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can view profiles in same clinic" ON public.profiles
  FOR SELECT USING (clinic_id = get_user_clinic_id());

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Admins can manage profiles" ON public.profiles
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role) AND
    clinic_id = get_user_clinic_id()
  );

CREATE POLICY "Super admins can view all profiles" ON public.profiles
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- User roles policies
CREATE POLICY "Users can view their own role" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Super admins can manage user roles" ON public.user_roles
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Clinic roles policies
CREATE POLICY "Users can view their clinic role" ON public.clinic_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can manage clinic roles" ON public.clinic_roles
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role) AND
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Super admins can manage clinic roles" ON public.clinic_roles
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can view all clinic roles" ON public.clinic_roles
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Owners policies
CREATE POLICY "Users can view owners in their clinic" ON public.owners
  FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Staff with edit permissions can manage owners" ON public.owners
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    can_edit_clinical_data(auth.uid(), clinic_id)
  );

CREATE POLICY "Super admins can view all owners" ON public.owners
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Patients policies
CREATE POLICY "Users can view patients in their clinic" ON public.patients
  FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Staff with edit permissions can manage patients" ON public.patients
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    can_edit_clinical_data(auth.uid(), clinic_id)
  );

CREATE POLICY "Super admins can view all patients" ON public.patients
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Support agents can view only ticket-related patients" ON public.patients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_agents sa
      JOIN support_tickets st ON st.related_consult_id IS NOT NULL
      JOIN consults c ON c.id = st.related_consult_id
      WHERE sa.user_id = auth.uid()
        AND c.patient_id = patients.id
        AND st.status IN ('open', 'in_progress')
    )
  );

-- Consults policies
CREATE POLICY "Users can view consults in their clinic" ON public.consults
  FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Staff with edit permissions can create consults" ON public.consults
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    can_edit_clinical_data(auth.uid(), clinic_id)
  );

CREATE POLICY "Staff with edit permissions can update consults" ON public.consults
  FOR UPDATE USING (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    can_edit_clinical_data(auth.uid(), clinic_id)
  );

CREATE POLICY "Staff with edit permissions can delete consults" ON public.consults
  FOR DELETE USING (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    can_edit_clinical_data(auth.uid(), clinic_id)
  );

CREATE POLICY "Super admins can view all consults" ON public.consults
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Support agents can view only ticket-related consults" ON public.consults
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_agents sa
      JOIN support_tickets st ON st.clinic_id = consults.clinic_id
      WHERE sa.user_id = auth.uid()
        AND st.related_consult_id = consults.id
        AND st.status IN ('open', 'in_progress')
    )
  );

-- Consult assignments policies
CREATE POLICY "Users can view assignments in their clinic" ON public.consult_assignments
  FOR SELECT USING (
    consult_id IN (
      SELECT id FROM public.consults
      WHERE clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Staff with edit permissions can assign users" ON public.consult_assignments
  FOR INSERT WITH CHECK (
    consult_id IN (
      SELECT c.id FROM consults c
      JOIN profiles p ON p.clinic_id = c.clinic_id
      WHERE p.user_id = auth.uid()
        AND can_edit_clinical_data(auth.uid(), c.clinic_id)
    )
  );

CREATE POLICY "Staff with edit permissions can remove assignments" ON public.consult_assignments
  FOR DELETE USING (
    consult_id IN (
      SELECT c.id FROM consults c
      JOIN profiles p ON p.clinic_id = c.clinic_id
      WHERE p.user_id = auth.uid()
        AND can_edit_clinical_data(auth.uid(), c.clinic_id)
    )
  );

CREATE POLICY "Super admins can view all consult assignments" ON public.consult_assignments
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Audio segments policies
CREATE POLICY "Users can view own segments" ON public.consult_audio_segments
  FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own segments" ON public.consult_audio_segments
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    user_id = auth.uid()
  );

CREATE POLICY "Super admins can view all audio segments" ON public.consult_audio_segments
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Case notes policies
CREATE POLICY "Users can view case notes in their clinic" ON public.case_notes
  FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Staff with edit permissions can create case notes" ON public.case_notes
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    can_edit_clinical_data(auth.uid(), clinic_id)
  );

CREATE POLICY "Staff with edit permissions can update case notes" ON public.case_notes
  FOR UPDATE USING (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    can_edit_clinical_data(auth.uid(), clinic_id)
  );

CREATE POLICY "Super admins can view all case notes" ON public.case_notes
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- File assets policies
CREATE POLICY "Users can view files in their clinic" ON public.file_assets
  FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can upload files to their clinic" ON public.file_assets
  FOR INSERT WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Super admins can view all file assets" ON public.file_assets
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Tasks policies
CREATE POLICY "Users can view tasks in their clinic" ON public.tasks
  FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create tasks" ON public.tasks
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    created_by = auth.uid()
  );

CREATE POLICY "Users can update tasks" ON public.tasks
  FOR UPDATE USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete tasks" ON public.tasks
  FOR DELETE USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Super admins can view all tasks" ON public.tasks
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Messages policies
CREATE POLICY "Users can view messages in their clinic" ON public.messages
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    (sender_id = auth.uid() OR recipient_id = auth.uid() OR recipient_id IS NULL)
  );

CREATE POLICY "Users can send messages in their clinic" ON public.messages
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    sender_id = auth.uid()
  );

CREATE POLICY "Users can mark their messages as read" ON public.messages
  FOR UPDATE USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "Super admins can view all messages" ON public.messages
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Notifications policies
CREATE POLICY "Users can view their own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own notifications" ON public.notifications
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Super admins can view all notifications" ON public.notifications
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Chat messages policies
CREATE POLICY "Users can view chat messages in their clinic" ON public.chat_messages
  FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create chat messages" ON public.chat_messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete chat messages in their clinic" ON public.chat_messages
  FOR DELETE USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Super admins can view all chat messages" ON public.chat_messages
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Support agents can view only ticket-related chat messages" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_agents sa
      JOIN support_tickets st ON st.related_consult_id IS NOT NULL
      WHERE sa.user_id = auth.uid()
        AND st.related_consult_id = chat_messages.consult_id
        AND st.status IN ('open', 'in_progress')
    )
  );

-- AI feedback policies
CREATE POLICY "Users can view their own feedback" ON public.ai_feedback
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can submit feedback in their clinic" ON public.ai_feedback
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    user_id = auth.uid()
  );

CREATE POLICY "Super admins can view all feedback" ON public.ai_feedback
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update feedback" ON public.ai_feedback
  FOR UPDATE USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Support tickets policies
CREATE POLICY "Users can view their own tickets" ON public.support_tickets
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create tickets in their clinic" ON public.support_tickets
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    user_id = auth.uid()
  );

CREATE POLICY "Support agents can view all tickets" ON public.support_tickets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.support_agents WHERE user_id = auth.uid())
  );

CREATE POLICY "Support agents can view assigned tickets" ON public.support_tickets
  FOR SELECT USING (
    assigned_to = auth.uid() OR
    EXISTS (SELECT 1 FROM public.support_agents WHERE user_id = auth.uid())
  );

CREATE POLICY "Support agents can update tickets" ON public.support_tickets
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.support_agents WHERE user_id = auth.uid())
  );

CREATE POLICY "Support agents can update assigned tickets" ON public.support_tickets
  FOR UPDATE USING (
    assigned_to = auth.uid() OR
    EXISTS (SELECT 1 FROM public.support_agents WHERE user_id = auth.uid()) OR
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Super admins can view all tickets" ON public.support_tickets
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update tickets" ON public.support_tickets
  FOR UPDATE USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Support ticket replies policies
CREATE POLICY "Users can view replies to their tickets" ON public.support_ticket_replies
  FOR SELECT USING (
    ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid()) AND
    NOT is_internal
  );

CREATE POLICY "Users and support can create replies" ON public.support_ticket_replies
  FOR INSERT WITH CHECK (
    ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.support_agents WHERE user_id = auth.uid()) OR
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Support agents can view all replies" ON public.support_ticket_replies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.support_agents WHERE user_id = auth.uid())
  );

CREATE POLICY "Super admins can view all replies" ON public.support_ticket_replies
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Support ticket reads policies
CREATE POLICY "Users can manage their support ticket reads" ON public.support_ticket_reads
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Support agents policies
CREATE POLICY "Support agents can view themselves" ON public.support_agents
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Super admins can manage support agents" ON public.support_agents
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can delete support agents" ON public.support_agents
  FOR DELETE USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Audit events policies
CREATE POLICY "Users can create audit events" ON public.audit_events
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    user_id = auth.uid()
  );

CREATE POLICY "Admins can view audit events" ON public.audit_events
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role) AND
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Super admins can view all audit events" ON public.audit_events
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Device sessions policies
CREATE POLICY "Users can view their own device sessions" ON public.device_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can insert device sessions" ON public.device_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can revoke their own device sessions" ON public.device_sessions
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admins can view all device sessions" ON public.device_sessions
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage all device sessions" ON public.device_sessions
  FOR UPDATE USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Push subscriptions policies
CREATE POLICY "Users can manage their own subscriptions" ON public.push_subscriptions
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Super admins can view all push subscriptions" ON public.push_subscriptions
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Referral codes policies
CREATE POLICY "Users can view their own referral codes" ON public.referral_codes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own referral codes" ON public.referral_codes
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Referrals policies
CREATE POLICY "Users can view referrals they made" ON public.referrals
  FOR SELECT USING (referrer_id = auth.uid());

CREATE POLICY "System can create referrals" ON public.referrals
  FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update referrals" ON public.referrals
  FOR UPDATE USING (true);

-- User credits policies
CREATE POLICY "Users can view their own credits" ON public.user_credits
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can award credits" ON public.user_credits
  FOR INSERT WITH CHECK (true);

-- Integration sync policies
CREATE POLICY "Admins can view integration sync" ON public.integration_sync
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role) AND
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Super admins can view all integration sync" ON public.integration_sync
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Master admin OTPs policies
CREATE POLICY "Super admins can view OTPs" ON public.master_admin_otps
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Allow system to insert OTPs" ON public.master_admin_otps
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow system to update OTPs" ON public.master_admin_otps
  FOR UPDATE USING (true);

-- Master admin backup codes policies
CREATE POLICY "Super admins can view backup codes" ON public.master_admin_backup_codes
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Allow system to insert backup codes" ON public.master_admin_backup_codes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow system to update backup codes" ON public.master_admin_backup_codes
  FOR UPDATE USING (true);

-- Master admin notes policies
CREATE POLICY "Super admins can manage notes" ON public.master_admin_notes
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Rate limit attempts policies
CREATE POLICY "System can manage rate limits" ON public.rate_limit_attempts
  FOR ALL USING (true)
  WITH CHECK (true);

CREATE POLICY "Super admins can view rate limits" ON public.rate_limit_attempts
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- ============================================================================
-- PART 11: PERFORMANCE INDEXES
-- ============================================================================

-- Profiles indexes
CREATE INDEX idx_profiles_clinic_id ON public.profiles(clinic_id);
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- User roles indexes
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);

-- Clinic roles indexes
CREATE INDEX idx_clinic_roles_user_id ON public.clinic_roles(user_id);
CREATE INDEX idx_clinic_roles_clinic_id ON public.clinic_roles(clinic_id);

-- Patients indexes
CREATE INDEX idx_patients_clinic_id ON public.patients(clinic_id);
CREATE INDEX idx_patients_owner_id ON public.patients(owner_id);
CREATE INDEX idx_patients_name ON public.patients(name);
CREATE INDEX idx_patients_patient_id ON public.patients USING GIN ((identifiers->'patient_id'));

-- Owners indexes
CREATE INDEX idx_owners_clinic_id ON public.owners(clinic_id);

-- Consults indexes
CREATE INDEX idx_consults_clinic_id ON public.consults(clinic_id);
CREATE INDEX idx_consults_patient_id ON public.consults(patient_id);
CREATE INDEX idx_consults_owner_id ON public.consults(owner_id);
CREATE INDEX idx_consults_vet_user_id ON public.consults(vet_user_id);
CREATE INDEX idx_consults_status ON public.consults(status);
CREATE INDEX idx_consults_started_at ON public.consults(started_at DESC);

-- Consult assignments indexes
CREATE INDEX idx_consult_assignments_consult_id ON public.consult_assignments(consult_id);
CREATE INDEX idx_consult_assignments_user_id ON public.consult_assignments(user_id);

-- Audio segments indexes
CREATE INDEX idx_audio_segments_consult_id ON public.consult_audio_segments(consult_id);
CREATE INDEX idx_audio_segments_clinic_id ON public.consult_audio_segments(clinic_id);

-- Case notes indexes
CREATE INDEX idx_case_notes_consult_id ON public.case_notes(consult_id);
CREATE INDEX idx_case_notes_clinic_id ON public.case_notes(clinic_id);

-- File assets indexes
CREATE INDEX idx_file_assets_clinic_id ON public.file_assets(clinic_id);
CREATE INDEX idx_file_assets_consult_id ON public.file_assets(consult_id);
CREATE INDEX idx_file_assets_created_at ON public.file_assets(created_at DESC);

-- Tasks indexes
CREATE INDEX idx_tasks_clinic_id ON public.tasks(clinic_id);
CREATE INDEX idx_tasks_consult_id ON public.tasks(consult_id);
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_due_at ON public.tasks(due_at);

-- Messages indexes
CREATE INDEX idx_messages_clinic_id ON public.messages(clinic_id);
CREATE INDEX idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX idx_messages_recipient_id ON public.messages(recipient_id);
CREATE INDEX idx_messages_read ON public.messages(read);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);

-- Notifications indexes
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_clinic_id ON public.notifications(clinic_id);
CREATE INDEX idx_notifications_read ON public.notifications(read);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);

-- Chat messages indexes
CREATE INDEX idx_chat_messages_consult_id ON public.chat_messages(consult_id);
CREATE INDEX idx_chat_messages_clinic_id ON public.chat_messages(clinic_id);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at);

-- Support tickets indexes
CREATE INDEX idx_support_tickets_clinic_id ON public.support_tickets(clinic_id);
CREATE INDEX idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_support_tickets_assigned_to ON public.support_tickets(assigned_to);
CREATE INDEX idx_support_tickets_created_at ON public.support_tickets(created_at DESC);

-- Support ticket replies indexes
CREATE INDEX idx_support_ticket_replies_ticket_id ON public.support_ticket_replies(ticket_id);
CREATE INDEX idx_support_ticket_replies_created_at ON public.support_ticket_replies(created_at);

-- Device sessions indexes
CREATE INDEX idx_device_sessions_user_id ON public.device_sessions(user_id);
CREATE INDEX idx_device_sessions_clinic_id ON public.device_sessions(clinic_id);
CREATE INDEX idx_device_sessions_device_fingerprint ON public.device_sessions(device_fingerprint);
CREATE INDEX idx_device_sessions_last_active_at ON public.device_sessions(last_active_at);

-- Referrals indexes
CREATE INDEX idx_referrals_referrer_id ON public.referrals(referrer_id);
CREATE INDEX idx_referrals_referred_user_id ON public.referrals(referred_user_id);
CREATE INDEX idx_referrals_referral_code ON public.referrals(referral_code);

-- User credits indexes
CREATE INDEX idx_user_credits_user_id ON public.user_credits(user_id);

-- Audit events indexes
CREATE INDEX idx_audit_events_clinic_id ON public.audit_events(clinic_id);
CREATE INDEX idx_audit_events_user_id ON public.audit_events(user_id);
CREATE INDEX idx_audit_events_created_at ON public.audit_events(created_at DESC);

-- Rate limit attempts indexes
CREATE INDEX idx_rate_limit_attempts_identifier ON public.rate_limit_attempts(identifier);
CREATE INDEX idx_rate_limit_attempts_action ON public.rate_limit_attempts(action);

-- ============================================================================
-- SCHEMA SETUP COMPLETE
-- ============================================================================
-- This master migration file has successfully recreated your entire database
-- schema. You can now proceed with:
--
-- 1. Configuring authentication (enable auto-confirm email)
-- 2. Creating the diagnostic-images storage bucket
-- 3. Adding required secrets (OpenAI, Stripe, Resend, VAPID)
-- 4. Testing core functionality
--
-- See REMIX_CHECKLIST.md for post-setup steps.
-- ============================================================================
