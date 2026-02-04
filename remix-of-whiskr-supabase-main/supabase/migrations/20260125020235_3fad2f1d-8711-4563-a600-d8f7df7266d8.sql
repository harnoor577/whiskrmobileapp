-- Fix the security definer view issue by making it security_invoker
DROP VIEW IF EXISTS public.compliance_audit_trail;

CREATE VIEW public.compliance_audit_trail 
WITH (security_invoker=on) AS
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