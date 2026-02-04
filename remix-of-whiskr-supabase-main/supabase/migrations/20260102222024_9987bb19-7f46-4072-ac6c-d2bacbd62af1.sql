-- Step 1: Create the trigger to auto-sync report sections on INSERT
CREATE TRIGGER sync_report_sections_trigger
  BEFORE INSERT ON public.reports_generated
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_report_sections();

-- Step 2: Backfill existing SOAP reports that have NULL section columns
UPDATE public.reports_generated rg
SET 
  soap_subjective = c.soap_s,
  soap_objective = c.soap_o,
  soap_assessment = c.soap_a,
  soap_plan = c.soap_p
FROM public.consults c
WHERE rg.consult_id = c.id
  AND rg.report_type = 'soap'
  AND rg.soap_subjective IS NULL
  AND c.soap_s IS NOT NULL;

-- Step 3: Backfill existing Procedure reports
UPDATE public.reports_generated rg
SET 
  procedure_summary = c.case_notes::jsonb->'procedure'->>'procedureSummary',
  procedure_pre_assessment = c.case_notes::jsonb->'procedure'->>'preProcedureAssessment',
  procedure_anesthetic_protocol = c.case_notes::jsonb->'procedure'->>'anestheticProtocol',
  procedure_details = c.case_notes::jsonb->'procedure'->>'procedureDetails',
  procedure_medications = c.case_notes::jsonb->'procedure'->>'medicationsAdministered',
  procedure_post_status = c.case_notes::jsonb->'procedure'->>'postProcedureStatus',
  procedure_follow_up = c.case_notes::jsonb->'procedure'->>'followUpInstructions',
  procedure_client_comm = c.case_notes::jsonb->'procedure'->>'clientCommunication',
  procedure_email_to_client = c.case_notes::jsonb->'procedure'->>'emailToClient'
FROM public.consults c
WHERE rg.consult_id = c.id
  AND rg.report_type = 'procedure'
  AND rg.procedure_summary IS NULL
  AND c.case_notes IS NOT NULL;

-- Step 4: Backfill existing Wellness reports
UPDATE public.reports_generated rg
SET 
  wellness_visit_header = c.case_notes::jsonb->'wellness'->>'visitHeader',
  wellness_vitals = c.case_notes::jsonb->'wellness'->>'vitalsWeightManagement',
  wellness_physical_exam = c.case_notes::jsonb->'wellness'->>'physicalExamination',
  wellness_vaccines = c.case_notes::jsonb->'wellness'->>'vaccinesAdministered',
  wellness_preventive_care = c.case_notes::jsonb->'wellness'->>'preventiveCareStatus',
  wellness_diet_nutrition = c.case_notes::jsonb->'wellness'->>'dietNutrition',
  wellness_owner_discussion = c.case_notes::jsonb->'wellness'->>'ownerDiscussion',
  wellness_recommendations = c.case_notes::jsonb->'wellness'->>'recommendations',
  wellness_client_education = c.case_notes::jsonb->'wellness'->>'clientEducation',
  wellness_clinician_notes = c.case_notes::jsonb->'wellness'->>'clinicianSignature'
FROM public.consults c
WHERE rg.consult_id = c.id
  AND rg.report_type = 'wellness'
  AND rg.wellness_visit_header IS NULL
  AND c.case_notes IS NOT NULL;