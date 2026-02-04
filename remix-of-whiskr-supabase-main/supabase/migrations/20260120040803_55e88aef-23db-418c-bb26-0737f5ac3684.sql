-- Add gps_location column to consult_history
ALTER TABLE consult_history 
ADD COLUMN IF NOT EXISTS gps_location TEXT;

COMMENT ON COLUMN consult_history.gps_location IS 
  'GPS coordinates captured at snapshot time (format: "lat, lng")';

-- Update the capture_consult_snapshot function to include gps_location
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
  
  -- Insert snapshot with all columns including gps_location
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
    vitals, case_notes_json, reason_for_visit, status,
    -- GPS location
    gps_location
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
    NEW.status,
    -- GPS location from consults.clinic_location
    NEW.clinic_location
  );
  
  RETURN NEW;
END;
$function$;