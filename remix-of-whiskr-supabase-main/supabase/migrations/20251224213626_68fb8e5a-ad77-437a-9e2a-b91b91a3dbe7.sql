-- Add SOAP section columns
ALTER TABLE public.reports_generated 
ADD COLUMN soap_subjective TEXT,
ADD COLUMN soap_objective TEXT,
ADD COLUMN soap_assessment TEXT,
ADD COLUMN soap_plan TEXT;

-- Add Procedure section columns
ALTER TABLE public.reports_generated 
ADD COLUMN procedure_summary TEXT,
ADD COLUMN procedure_pre_assessment TEXT,
ADD COLUMN procedure_anesthetic_protocol TEXT,
ADD COLUMN procedure_details TEXT,
ADD COLUMN procedure_medications TEXT,
ADD COLUMN procedure_post_status TEXT,
ADD COLUMN procedure_follow_up TEXT,
ADD COLUMN procedure_client_comm TEXT,
ADD COLUMN procedure_email_to_client TEXT;

-- Add Wellness section columns
ALTER TABLE public.reports_generated 
ADD COLUMN wellness_visit_header TEXT,
ADD COLUMN wellness_vitals TEXT,
ADD COLUMN wellness_physical_exam TEXT,
ADD COLUMN wellness_vaccines TEXT,
ADD COLUMN wellness_preventive_care TEXT,
ADD COLUMN wellness_diet_nutrition TEXT,
ADD COLUMN wellness_owner_discussion TEXT,
ADD COLUMN wellness_recommendations TEXT,
ADD COLUMN wellness_client_education TEXT,
ADD COLUMN wellness_clinician_notes TEXT;

-- Backfill existing records from consults table
UPDATE public.reports_generated rg
SET 
  -- SOAP sections (for soap reports)
  soap_subjective = CASE WHEN rg.report_type = 'soap' THEN c.soap_s ELSE NULL END,
  soap_objective = CASE WHEN rg.report_type = 'soap' THEN c.soap_o ELSE NULL END,
  soap_assessment = CASE WHEN rg.report_type = 'soap' THEN c.soap_a ELSE NULL END,
  soap_plan = CASE WHEN rg.report_type = 'soap' THEN c.soap_p ELSE NULL END,
  -- Procedure sections (for procedure reports)
  procedure_summary = CASE WHEN rg.report_type = 'procedure' THEN c.case_notes::jsonb->'procedure'->>'procedureSummary' ELSE NULL END,
  procedure_pre_assessment = CASE WHEN rg.report_type = 'procedure' THEN c.case_notes::jsonb->'procedure'->>'preProcedureAssessment' ELSE NULL END,
  procedure_anesthetic_protocol = CASE WHEN rg.report_type = 'procedure' THEN c.case_notes::jsonb->'procedure'->>'anestheticProtocol' ELSE NULL END,
  procedure_details = CASE WHEN rg.report_type = 'procedure' THEN c.case_notes::jsonb->'procedure'->>'procedureDetails' ELSE NULL END,
  procedure_medications = CASE WHEN rg.report_type = 'procedure' THEN c.case_notes::jsonb->'procedure'->>'medicationsAdministered' ELSE NULL END,
  procedure_post_status = CASE WHEN rg.report_type = 'procedure' THEN c.case_notes::jsonb->'procedure'->>'postProcedureStatus' ELSE NULL END,
  procedure_follow_up = CASE WHEN rg.report_type = 'procedure' THEN c.case_notes::jsonb->'procedure'->>'followUpInstructions' ELSE NULL END,
  procedure_client_comm = CASE WHEN rg.report_type = 'procedure' THEN c.case_notes::jsonb->'procedure'->>'clientCommunication' ELSE NULL END,
  procedure_email_to_client = CASE WHEN rg.report_type = 'procedure' THEN c.case_notes::jsonb->'procedure'->>'emailToClient' ELSE NULL END,
  -- Wellness sections (for wellness reports)
  wellness_visit_header = CASE WHEN rg.report_type = 'wellness' THEN c.case_notes::jsonb->'wellness'->>'visitHeader' ELSE NULL END,
  wellness_vitals = CASE WHEN rg.report_type = 'wellness' THEN c.case_notes::jsonb->'wellness'->>'vitalsWeightManagement' ELSE NULL END,
  wellness_physical_exam = CASE WHEN rg.report_type = 'wellness' THEN c.case_notes::jsonb->'wellness'->>'physicalExamination' ELSE NULL END,
  wellness_vaccines = CASE WHEN rg.report_type = 'wellness' THEN c.case_notes::jsonb->'wellness'->>'vaccinesAdministered' ELSE NULL END,
  wellness_preventive_care = CASE WHEN rg.report_type = 'wellness' THEN c.case_notes::jsonb->'wellness'->>'preventiveCareStatus' ELSE NULL END,
  wellness_diet_nutrition = CASE WHEN rg.report_type = 'wellness' THEN c.case_notes::jsonb->'wellness'->>'dietNutrition' ELSE NULL END,
  wellness_owner_discussion = CASE WHEN rg.report_type = 'wellness' THEN c.case_notes::jsonb->'wellness'->>'ownerDiscussion' ELSE NULL END,
  wellness_recommendations = CASE WHEN rg.report_type = 'wellness' THEN c.case_notes::jsonb->'wellness'->>'recommendations' ELSE NULL END,
  wellness_client_education = CASE WHEN rg.report_type = 'wellness' THEN c.case_notes::jsonb->'wellness'->>'clientEducation' ELSE NULL END,
  wellness_clinician_notes = CASE WHEN rg.report_type = 'wellness' THEN c.case_notes::jsonb->'wellness'->>'clinicianSignature' ELSE NULL END
FROM public.consults c
WHERE rg.consult_id = c.id;

-- Create trigger function to auto-populate section columns on insert
CREATE OR REPLACE FUNCTION public.sync_report_sections()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consult RECORD;
BEGIN
  -- Only proceed if we have a consult_id
  IF NEW.consult_id IS NOT NULL THEN
    SELECT soap_s, soap_o, soap_a, soap_p, case_notes
    INTO v_consult
    FROM public.consults
    WHERE id = NEW.consult_id;
    
    IF FOUND THEN
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
$$;

-- Create trigger to execute on insert
CREATE TRIGGER set_report_sections
  BEFORE INSERT ON public.reports_generated
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_report_sections();