-- Step 1: Add transcription column to reports_generated
ALTER TABLE public.reports_generated
ADD COLUMN transcription TEXT;

-- Step 2: Update the sync_report_sections function to include transcription
CREATE OR REPLACE FUNCTION public.sync_report_sections()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_consult RECORD;
BEGIN
  IF NEW.consult_id IS NOT NULL THEN
    SELECT soap_s, soap_o, soap_a, soap_p, case_notes, original_input
    INTO v_consult
    FROM public.consults
    WHERE id = NEW.consult_id;
    
    IF FOUND THEN
      -- Always sync transcription
      NEW.transcription := v_consult.original_input;
      
      -- Populate based on report_type
      IF NEW.report_type = 'soap' THEN
        NEW.soap_subjective := v_consult.soap_s;
        NEW.soap_objective := v_consult.soap_o;
        NEW.soap_assessment := v_consult.soap_a;
        NEW.soap_plan := v_consult.soap_p;
      ELSIF NEW.report_type = 'procedure' THEN
        NEW.procedure_summary := v_consult.case_notes::jsonb->'procedure'->>'procedureSummary';
        NEW.procedure_pre_assessment := v_consult.case_notes::jsonb->'procedure'->>'preProcedureAssessment';
        NEW.procedure_anesthetic_protocol := v_consult.case_notes::jsonb->'procedure'->>'anestheticProtocol';
        NEW.procedure_details := v_consult.case_notes::jsonb->'procedure'->>'procedureDetails';
        NEW.procedure_medications := v_consult.case_notes::jsonb->'procedure'->>'medicationsAdministered';
        NEW.procedure_post_status := v_consult.case_notes::jsonb->'procedure'->>'postProcedureStatus';
        NEW.procedure_follow_up := v_consult.case_notes::jsonb->'procedure'->>'followUpInstructions';
        NEW.procedure_client_comm := v_consult.case_notes::jsonb->'procedure'->>'clientCommunication';
        NEW.procedure_email_to_client := v_consult.case_notes::jsonb->'procedure'->>'emailToClient';
      ELSIF NEW.report_type = 'wellness' THEN
        NEW.wellness_visit_header := v_consult.case_notes::jsonb->'wellness'->>'visitHeader';
        NEW.wellness_vitals := v_consult.case_notes::jsonb->'wellness'->>'vitalsWeightManagement';
        NEW.wellness_physical_exam := v_consult.case_notes::jsonb->'wellness'->>'physicalExamination';
        NEW.wellness_vaccines := v_consult.case_notes::jsonb->'wellness'->>'vaccinesAdministered';
        NEW.wellness_preventive_care := v_consult.case_notes::jsonb->'wellness'->>'preventiveCareStatus';
        NEW.wellness_diet_nutrition := v_consult.case_notes::jsonb->'wellness'->>'dietNutrition';
        NEW.wellness_owner_discussion := v_consult.case_notes::jsonb->'wellness'->>'ownerDiscussion';
        NEW.wellness_recommendations := v_consult.case_notes::jsonb->'wellness'->>'recommendations';
        NEW.wellness_client_education := v_consult.case_notes::jsonb->'wellness'->>'clientEducation';
        NEW.wellness_clinician_notes := v_consult.case_notes::jsonb->'wellness'->>'clinicianSignature';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Step 3: Backfill existing records with transcription data
UPDATE public.reports_generated rg
SET transcription = c.original_input
FROM public.consults c
WHERE rg.consult_id = c.id
  AND rg.transcription IS NULL
  AND c.original_input IS NOT NULL;