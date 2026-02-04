-- Phase 1: Add User/Device Tracking Columns
ALTER TABLE public.consult_history
ADD COLUMN IF NOT EXISTS user_email TEXT,
ADD COLUMN IF NOT EXISTS user_name TEXT,
ADD COLUMN IF NOT EXISTS device_name TEXT;

-- Phase 2: Add Section-Wise Wellness Columns
ALTER TABLE public.consult_history
ADD COLUMN IF NOT EXISTS wellness_patient_info TEXT,
ADD COLUMN IF NOT EXISTS wellness_vitals_weight TEXT,
ADD COLUMN IF NOT EXISTS wellness_physical_exam TEXT,
ADD COLUMN IF NOT EXISTS wellness_assessment TEXT,
ADD COLUMN IF NOT EXISTS wellness_vaccines TEXT,
ADD COLUMN IF NOT EXISTS wellness_preventive_care TEXT,
ADD COLUMN IF NOT EXISTS wellness_diet_nutrition TEXT,
ADD COLUMN IF NOT EXISTS wellness_owner_discussion TEXT,
ADD COLUMN IF NOT EXISTS wellness_recommendations TEXT,
ADD COLUMN IF NOT EXISTS wellness_client_education TEXT;

-- Phase 3: Add Section-Wise Procedure Columns
ALTER TABLE public.consult_history
ADD COLUMN IF NOT EXISTS procedure_summary TEXT,
ADD COLUMN IF NOT EXISTS procedure_pre_assessment TEXT,
ADD COLUMN IF NOT EXISTS procedure_anesthetic_protocol TEXT,
ADD COLUMN IF NOT EXISTS procedure_details TEXT,
ADD COLUMN IF NOT EXISTS procedure_medications TEXT,
ADD COLUMN IF NOT EXISTS procedure_post_status TEXT,
ADD COLUMN IF NOT EXISTS procedure_follow_up TEXT,
ADD COLUMN IF NOT EXISTS procedure_client_comm TEXT,
ADD COLUMN IF NOT EXISTS procedure_email_to_client TEXT;

-- Phase 4: Add Case Summary Content Columns
ALTER TABLE public.consult_history
ADD COLUMN IF NOT EXISTS case_notes TEXT,
ADD COLUMN IF NOT EXISTS discharge_summary TEXT,
ADD COLUMN IF NOT EXISTS client_education TEXT,
ADD COLUMN IF NOT EXISTS pdf_export_content TEXT,
ADD COLUMN IF NOT EXISTS pdf_export_type TEXT,
ADD COLUMN IF NOT EXISTS pdf_exported_at TIMESTAMPTZ;

-- Phase 5: Update the capture_consult_snapshot() trigger
CREATE OR REPLACE FUNCTION public.capture_consult_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_version INTEGER;
  v_patient RECORD;
  v_owner RECORD;
  v_vet RECORD;
  v_snapshot_type TEXT;
  v_device RECORD;
  v_case_notes_json JSONB;
BEGIN
  -- Determine snapshot type
  IF TG_OP = 'INSERT' THEN
    v_snapshot_type := 'initial';
  ELSIF NEW.finalized_at IS NOT NULL AND OLD.finalized_at IS NULL THEN
    v_snapshot_type := 'finalized';
  ELSIF NEW.finalized_at IS NULL AND OLD.finalized_at IS NOT NULL THEN
    v_snapshot_type := 'unfinalized';
  ELSIF NEW.soap_s IS DISTINCT FROM OLD.soap_s 
     OR NEW.soap_o IS DISTINCT FROM OLD.soap_o
     OR NEW.soap_a IS DISTINCT FROM OLD.soap_a
     OR NEW.soap_p IS DISTINCT FROM OLD.soap_p
     OR NEW.case_notes IS DISTINCT FROM OLD.case_notes THEN
    v_snapshot_type := 'edited';
  ELSE
    RETURN NEW; -- No significant change, skip snapshot
  END IF;
  
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version
  FROM consult_history
  WHERE consult_id = NEW.id;
  
  -- Fetch related data
  SELECT * INTO v_patient FROM patients WHERE id = NEW.patient_id;
  SELECT * INTO v_owner FROM owners WHERE id = NEW.owner_id;
  SELECT name, email INTO v_vet FROM profiles WHERE user_id = NEW.vet_user_id;
  
  -- Fetch device info for current user
  SELECT device_name INTO v_device 
  FROM device_sessions 
  WHERE user_id = auth.uid() 
    AND NOT revoked 
  ORDER BY last_active_at DESC 
  LIMIT 1;
  
  -- Parse case_notes JSON
  v_case_notes_json := NEW.case_notes::jsonb;
  
  -- Insert snapshot with all new columns
  INSERT INTO consult_history (
    consult_id, clinic_id, patient_id, owner_id, vet_user_id,
    snapshot_type, version_number, created_by,
    -- User/Device tracking
    user_email, user_name, device_name,
    -- Patient info
    patient_name, patient_species, patient_breed, patient_weight_kg, patient_age,
    -- Owner info
    owner_name, owner_email, owner_phone,
    -- Vet info
    vet_name, vet_email,
    -- Transcription
    transcription_complete, transcription_method, audio_duration_seconds,
    -- SOAP sections
    soap_s, soap_o, soap_a, soap_p,
    -- Wellness sections (individual columns)
    wellness_patient_info, wellness_vitals_weight, wellness_physical_exam,
    wellness_assessment, wellness_vaccines, wellness_preventive_care,
    wellness_diet_nutrition, wellness_owner_discussion, wellness_recommendations,
    wellness_client_education,
    -- Procedure sections (individual columns)
    procedure_summary, procedure_pre_assessment, procedure_anesthetic_protocol,
    procedure_details, procedure_medications, procedure_post_status,
    procedure_follow_up, procedure_client_comm, procedure_email_to_client,
    -- Case summary content
    case_notes, discharge_summary, client_education,
    -- Legacy JSONB (keep for backwards compatibility)
    wellness_data, procedure_data,
    -- Other fields
    vitals, case_notes_json, reason_for_visit, status
  ) VALUES (
    NEW.id, NEW.clinic_id, NEW.patient_id, NEW.owner_id, NEW.vet_user_id,
    v_snapshot_type, v_version, auth.uid(),
    -- User/Device tracking
    v_vet.email, v_vet.name, v_device.device_name,
    -- Patient info
    v_patient.name, v_patient.species, v_patient.breed, v_patient.weight_kg, v_patient.age,
    -- Owner info
    v_owner.name, v_owner.email, v_owner.phone,
    -- Vet info
    v_vet.name, v_vet.email,
    -- Transcription
    NEW.original_input, NEW.transcription_method, NEW.audio_duration_seconds,
    -- SOAP sections
    NEW.soap_s, NEW.soap_o, NEW.soap_a, NEW.soap_p,
    -- Wellness sections
    v_case_notes_json->'wellness'->>'patientInformation',
    v_case_notes_json->'wellness'->>'vitalsWeightManagement',
    v_case_notes_json->'wellness'->>'physicalExamination',
    v_case_notes_json->'wellness'->>'assessment',
    v_case_notes_json->'wellness'->>'vaccinesAdministered',
    v_case_notes_json->'wellness'->>'preventiveCareStatus',
    v_case_notes_json->'wellness'->>'dietNutrition',
    v_case_notes_json->'wellness'->>'ownerDiscussion',
    v_case_notes_json->'wellness'->>'recommendations',
    v_case_notes_json->'wellness'->>'clientEducation',
    -- Procedure sections
    v_case_notes_json->'procedure'->>'procedureSummary',
    v_case_notes_json->'procedure'->>'preProcedureAssessment',
    v_case_notes_json->'procedure'->>'anestheticProtocol',
    v_case_notes_json->'procedure'->>'procedureDetails',
    v_case_notes_json->'procedure'->>'medicationsAdministered',
    v_case_notes_json->'procedure'->>'postProcedureStatus',
    v_case_notes_json->'procedure'->>'followUpInstructions',
    v_case_notes_json->'procedure'->>'clientCommunication',
    v_case_notes_json->'procedure'->>'emailToClient',
    -- Case summary content
    NEW.case_notes,
    v_case_notes_json->>'discharge_summary',
    v_case_notes_json->>'client_education',
    -- Legacy JSONB
    v_case_notes_json->'wellness',
    v_case_notes_json->'procedure',
    -- Other fields
    jsonb_build_object(
      'temperature_f', NEW.vitals_temperature_f,
      'temperature_c', NEW.vitals_temperature_c,
      'heart_rate', NEW.vitals_heart_rate,
      'respiratory_rate', NEW.vitals_respiratory_rate,
      'pain_score', NEW.vitals_pain_score,
      'body_condition_score', NEW.vitals_body_condition_score,
      'weight_kg', NEW.weight_kg,
      'weight_lb', NEW.weight_lb
    ),
    v_case_notes_json,
    NEW.reason_for_visit,
    NEW.status
  );
  
  RETURN NEW;
END;
$function$;

-- Phase 6: Create PDF Export Logging Function
CREATE OR REPLACE FUNCTION public.log_pdf_export(
  p_consult_id UUID,
  p_pdf_type TEXT,
  p_pdf_content TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_history_id UUID;
  v_consult RECORD;
  v_patient RECORD;
  v_owner RECORD;
  v_vet RECORD;
  v_device RECORD;
  v_version INTEGER;
  v_case_notes_json JSONB;
BEGIN
  -- Fetch consult data
  SELECT * INTO v_consult FROM consults WHERE id = p_consult_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consult not found';
  END IF;
  
  -- Fetch related data
  SELECT * INTO v_patient FROM patients WHERE id = v_consult.patient_id;
  SELECT * INTO v_owner FROM owners WHERE id = v_consult.owner_id;
  SELECT name, email INTO v_vet FROM profiles WHERE user_id = v_consult.vet_user_id;
  
  -- Fetch device info
  SELECT device_name INTO v_device 
  FROM device_sessions 
  WHERE user_id = auth.uid() 
    AND NOT revoked 
  ORDER BY last_active_at DESC 
  LIMIT 1;
  
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version
  FROM consult_history
  WHERE consult_id = p_consult_id;
  
  -- Parse case_notes JSON
  v_case_notes_json := v_consult.case_notes::jsonb;
  
  -- Insert PDF export snapshot
  INSERT INTO consult_history (
    consult_id, clinic_id, patient_id, owner_id, vet_user_id,
    snapshot_type, version_number, created_by,
    user_email, user_name, device_name,
    patient_name, patient_species, patient_breed, patient_weight_kg, patient_age,
    owner_name, owner_email, owner_phone,
    vet_name, vet_email,
    transcription_complete, transcription_method, audio_duration_seconds,
    soap_s, soap_o, soap_a, soap_p,
    wellness_patient_info, wellness_vitals_weight, wellness_physical_exam,
    wellness_assessment, wellness_vaccines, wellness_preventive_care,
    wellness_diet_nutrition, wellness_owner_discussion, wellness_recommendations,
    wellness_client_education,
    procedure_summary, procedure_pre_assessment, procedure_anesthetic_protocol,
    procedure_details, procedure_medications, procedure_post_status,
    procedure_follow_up, procedure_client_comm, procedure_email_to_client,
    case_notes, discharge_summary, client_education,
    pdf_export_content, pdf_export_type, pdf_exported_at,
    wellness_data, procedure_data,
    vitals, case_notes_json, reason_for_visit, status
  ) VALUES (
    p_consult_id, v_consult.clinic_id, v_consult.patient_id, v_consult.owner_id, v_consult.vet_user_id,
    'pdf_export', v_version, auth.uid(),
    v_vet.email, v_vet.name, v_device.device_name,
    v_patient.name, v_patient.species, v_patient.breed, v_patient.weight_kg, v_patient.age,
    v_owner.name, v_owner.email, v_owner.phone,
    v_vet.name, v_vet.email,
    v_consult.original_input, v_consult.transcription_method, v_consult.audio_duration_seconds,
    v_consult.soap_s, v_consult.soap_o, v_consult.soap_a, v_consult.soap_p,
    v_case_notes_json->'wellness'->>'patientInformation',
    v_case_notes_json->'wellness'->>'vitalsWeightManagement',
    v_case_notes_json->'wellness'->>'physicalExamination',
    v_case_notes_json->'wellness'->>'assessment',
    v_case_notes_json->'wellness'->>'vaccinesAdministered',
    v_case_notes_json->'wellness'->>'preventiveCareStatus',
    v_case_notes_json->'wellness'->>'dietNutrition',
    v_case_notes_json->'wellness'->>'ownerDiscussion',
    v_case_notes_json->'wellness'->>'recommendations',
    v_case_notes_json->'wellness'->>'clientEducation',
    v_case_notes_json->'procedure'->>'procedureSummary',
    v_case_notes_json->'procedure'->>'preProcedureAssessment',
    v_case_notes_json->'procedure'->>'anestheticProtocol',
    v_case_notes_json->'procedure'->>'procedureDetails',
    v_case_notes_json->'procedure'->>'medicationsAdministered',
    v_case_notes_json->'procedure'->>'postProcedureStatus',
    v_case_notes_json->'procedure'->>'followUpInstructions',
    v_case_notes_json->'procedure'->>'clientCommunication',
    v_case_notes_json->'procedure'->>'emailToClient',
    v_consult.case_notes,
    v_case_notes_json->>'discharge_summary',
    v_case_notes_json->>'client_education',
    p_pdf_content, p_pdf_type, now(),
    v_case_notes_json->'wellness',
    v_case_notes_json->'procedure',
    jsonb_build_object(
      'temperature_f', v_consult.vitals_temperature_f,
      'temperature_c', v_consult.vitals_temperature_c,
      'heart_rate', v_consult.vitals_heart_rate,
      'respiratory_rate', v_consult.vitals_respiratory_rate,
      'pain_score', v_consult.vitals_pain_score,
      'body_condition_score', v_consult.vitals_body_condition_score,
      'weight_kg', v_consult.weight_kg,
      'weight_lb', v_consult.weight_lb
    ),
    v_case_notes_json,
    v_consult.reason_for_visit,
    v_consult.status
  )
  RETURNING id INTO v_history_id;
  
  RETURN v_history_id;
END;
$function$;

-- Phase 7: Update consult_complete_view to include new columns
DROP VIEW IF EXISTS public.consult_complete_view;
CREATE VIEW public.consult_complete_view AS
SELECT 
  ch.*,
  c.finalized_at,
  c.finalized_by,
  c.version as current_version
FROM public.consult_history ch
LEFT JOIN public.consults c ON ch.consult_id = c.id;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_consult_history_pdf_export ON public.consult_history(consult_id, pdf_export_type) WHERE pdf_export_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consult_history_user_email ON public.consult_history(user_email) WHERE user_email IS NOT NULL;