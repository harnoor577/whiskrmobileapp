-- Backfill reports_generated from existing finalized consults
-- Uses clinic admin as fallback when vet_user_id and finalized_by are NULL
INSERT INTO public.reports_generated (
  consult_id,
  clinic_id,
  user_id,
  patient_id,
  patient_name,
  report_type,
  created_at,
  is_latest,
  version_number,
  soap_s,
  soap_o,
  soap_a,
  soap_p,
  wellness_summary,
  wellness_client_education,
  procedure_name,
  procedure_indication
)
SELECT 
  c.id as consult_id,
  c.clinic_id,
  COALESCE(c.vet_user_id, c.finalized_by, (
    SELECT p.user_id FROM profiles p WHERE p.clinic_id = c.clinic_id LIMIT 1
  )) as user_id,
  c.patient_id,
  pat.name as patient_name,
  CASE 
    WHEN c.visit_type = 'procedure' OR c.procedure_name IS NOT NULL THEN 'procedure'
    WHEN c.visit_type = 'wellness' THEN 'wellness'
    ELSE 'soap'
  END as report_type,
  COALESCE(c.finalized_at, c.created_at) as created_at,
  true as is_latest,
  1 as version_number,
  c.soap_s,
  c.soap_o,
  c.soap_a,
  c.soap_p,
  c.discharge_summary as wellness_summary,
  c.client_education as wellness_client_education,
  c.procedure_name,
  c.procedure_indication
FROM consults c
LEFT JOIN patients pat ON c.patient_id = pat.id
WHERE c.status = 'finalized'
  AND NOT EXISTS (
    SELECT 1 FROM reports_generated rg 
    WHERE rg.consult_id = c.id
  );