-- Function to sync consult data to linked reports
CREATE OR REPLACE FUNCTION public.sync_consult_to_reports()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Update all linked SOAP reports
  UPDATE public.reports_generated
  SET 
    transcription = NEW.original_input,
    soap_subjective = NEW.soap_s,
    soap_objective = NEW.soap_o,
    soap_assessment = NEW.soap_a,
    soap_plan = NEW.soap_p
  WHERE consult_id = NEW.id 
    AND report_type = 'soap';
    
  -- Update all linked procedure reports
  UPDATE public.reports_generated
  SET 
    transcription = NEW.original_input,
    procedure_summary = NEW.case_notes::jsonb->'procedure'->>'procedureSummary',
    procedure_pre_assessment = NEW.case_notes::jsonb->'procedure'->>'preProcedureAssessment',
    procedure_anesthetic_protocol = NEW.case_notes::jsonb->'procedure'->>'anestheticProtocol',
    procedure_details = NEW.case_notes::jsonb->'procedure'->>'procedureDetails',
    procedure_medications = NEW.case_notes::jsonb->'procedure'->>'medicationsAdministered',
    procedure_post_status = NEW.case_notes::jsonb->'procedure'->>'postProcedureStatus',
    procedure_follow_up = NEW.case_notes::jsonb->'procedure'->>'followUpInstructions',
    procedure_client_comm = NEW.case_notes::jsonb->'procedure'->>'clientCommunication',
    procedure_email_to_client = NEW.case_notes::jsonb->'procedure'->>'emailToClient'
  WHERE consult_id = NEW.id 
    AND report_type = 'procedure';
    
  -- Update all linked wellness reports
  UPDATE public.reports_generated
  SET 
    transcription = NEW.original_input,
    wellness_visit_header = COALESCE(
      NEW.case_notes::jsonb->'wellness'->>'patientInformation',
      NEW.case_notes::jsonb->'wellness'->>'visitHeader'
    ),
    wellness_vitals = NEW.case_notes::jsonb->'wellness'->>'vitalsWeightManagement',
    wellness_physical_exam = NEW.case_notes::jsonb->'wellness'->>'physicalExamination',
    wellness_vaccines = NEW.case_notes::jsonb->'wellness'->>'vaccinesAdministered',
    wellness_preventive_care = NEW.case_notes::jsonb->'wellness'->>'preventiveCareStatus',
    wellness_diet_nutrition = NEW.case_notes::jsonb->'wellness'->>'dietNutrition',
    wellness_owner_discussion = NEW.case_notes::jsonb->'wellness'->>'ownerDiscussion',
    wellness_recommendations = NEW.case_notes::jsonb->'wellness'->>'recommendations',
    wellness_client_education = NEW.case_notes::jsonb->'wellness'->>'clientEducation',
    wellness_clinician_notes = NEW.case_notes::jsonb->'wellness'->>'clinicianSignature'
  WHERE consult_id = NEW.id 
    AND report_type = 'wellness';
  
  RETURN NEW;
END;
$$;

-- Create trigger on consults table
DROP TRIGGER IF EXISTS sync_consult_to_reports_trigger ON public.consults;
CREATE TRIGGER sync_consult_to_reports_trigger
  AFTER UPDATE ON public.consults
  FOR EACH ROW
  WHEN (
    OLD.soap_s IS DISTINCT FROM NEW.soap_s OR
    OLD.soap_o IS DISTINCT FROM NEW.soap_o OR
    OLD.soap_a IS DISTINCT FROM NEW.soap_a OR
    OLD.soap_p IS DISTINCT FROM NEW.soap_p OR
    OLD.case_notes IS DISTINCT FROM NEW.case_notes OR
    OLD.original_input IS DISTINCT FROM NEW.original_input
  )
  EXECUTE FUNCTION public.sync_consult_to_reports();