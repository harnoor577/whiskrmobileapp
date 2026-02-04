-- Drop duplicate trigger
DROP TRIGGER IF EXISTS set_report_sections ON public.reports_generated;

-- Update function with correct wellness field mapping and fallback
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
        -- Use patientInformation with fallback to visitHeader for backwards compatibility
        NEW.wellness_visit_header := COALESCE(
          v_consult.case_notes::jsonb->'wellness'->>'patientInformation',
          v_consult.case_notes::jsonb->'wellness'->>'visitHeader'
        );
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

-- Recreate trigger to fire on both INSERT and UPDATE
DROP TRIGGER IF EXISTS sync_report_sections_trigger ON public.reports_generated;
CREATE TRIGGER sync_report_sections_trigger
  BEFORE INSERT OR UPDATE ON public.reports_generated
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_report_sections();