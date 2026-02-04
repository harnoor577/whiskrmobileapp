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
-- PART 10: ENABLE ROW-LEVEL SECURITY
-- ============================================================================

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