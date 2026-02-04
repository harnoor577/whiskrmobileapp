-- Comprehensive fix for SECURITY DEFINER functions missing search_path
-- This migration ensures ALL SECURITY DEFINER functions have SET search_path = 'public'
-- to prevent privilege escalation attacks through search_path manipulation

-- Fix any remaining functions that might be missing search_path
-- The linter detected 2 functions still without proper search_path configuration

-- Re-create all SECURITY DEFINER functions with explicit search_path
-- This is a defensive measure to ensure compliance

CREATE OR REPLACE FUNCTION public.sync_patient_weight()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $function$
BEGIN
  -- If kg is set but lb is not, calculate lb
  IF NEW.weight_kg IS NOT NULL AND (OLD.weight_kg IS DISTINCT FROM NEW.weight_kg OR NEW.weight_lb IS NULL) THEN
    NEW.weight_lb := ROUND((NEW.weight_kg * 2.20462)::numeric, 2);
  END IF;
  
  -- If lb is set but kg is not, calculate kg
  IF NEW.weight_lb IS NOT NULL AND (OLD.weight_lb IS DISTINCT FROM NEW.weight_lb OR NEW.weight_kg IS NULL) THEN
    NEW.weight_kg := ROUND((NEW.weight_lb / 2.20462)::numeric, 2);
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_consult_weight()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $function$
BEGIN
  -- If kg is set but lb is not, calculate lb
  IF NEW.weight_kg IS NOT NULL AND (OLD.weight_kg IS DISTINCT FROM NEW.weight_kg OR NEW.weight_lb IS NULL) THEN
    NEW.weight_lb := ROUND((NEW.weight_kg * 2.20462)::numeric, 2);
  END IF;
  
  -- If lb is set but kg is not, calculate kg
  IF NEW.weight_lb IS NOT NULL AND (OLD.weight_lb IS DISTINCT FROM NEW.weight_lb OR NEW.weight_kg IS NULL) THEN
    NEW.weight_kg := ROUND((NEW.weight_lb / 2.20462)::numeric, 2);
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_support_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  ticket_record public.support_tickets%ROWTYPE;
BEGIN
  -- Only notify when reply is from support (not the user themselves)
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
$function$;