-- =====================================================
-- PHASE 1: Create consult_history table for complete snapshots
-- =====================================================

CREATE TABLE public.consult_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consult_id UUID NOT NULL REFERENCES consults(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  owner_id UUID NOT NULL REFERENCES owners(id),
  vet_user_id UUID REFERENCES auth.users(id),
  
  -- Snapshot metadata
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('initial', 'report_generated', 'finalized', 'edited', 'unfinalized')),
  version_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  
  -- Patient details at time of snapshot (denormalized for historical accuracy)
  patient_name TEXT,
  patient_species TEXT,
  patient_breed TEXT,
  patient_weight_kg NUMERIC,
  patient_age TEXT,
  owner_name TEXT,
  owner_email TEXT,
  owner_phone TEXT,
  vet_name TEXT,
  vet_email TEXT,
  
  -- Full transcription state
  transcription_complete TEXT,
  transcription_method TEXT,
  audio_duration_seconds INTEGER,
  
  -- SOAP content
  soap_s TEXT,
  soap_o TEXT,
  soap_a TEXT,
  soap_p TEXT,
  
  -- Wellness content (JSONB for flexibility)
  wellness_data JSONB,
  
  -- Procedure content (JSONB for flexibility)
  procedure_data JSONB,
  
  -- Other consult data
  vitals JSONB,
  case_notes_json JSONB,
  reason_for_visit TEXT,
  status TEXT,
  
  -- Metadata
  device_fingerprint TEXT,
  ip_address TEXT,
  user_agent TEXT
);

-- Indexes for efficient queries
CREATE INDEX idx_consult_history_consult_id ON consult_history(consult_id);
CREATE INDEX idx_consult_history_clinic_id ON consult_history(clinic_id);
CREATE INDEX idx_consult_history_patient_id ON consult_history(patient_id);
CREATE INDEX idx_consult_history_created_at ON consult_history(created_at DESC);
CREATE INDEX idx_consult_history_snapshot_type ON consult_history(snapshot_type);

-- =====================================================
-- PHASE 2: Create transcription_history table
-- =====================================================

CREATE TABLE public.transcription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consult_id UUID NOT NULL REFERENCES consults(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id),
  user_id UUID NOT NULL,
  
  -- Version tracking
  version_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Source of this transcription
  source_type TEXT NOT NULL CHECK (source_type IN ('voice_recording', 'manual_edit', 'diagnostic_analysis', 'case_note', 'typed_input')),
  source_id UUID,
  
  -- Content
  transcription_content TEXT NOT NULL,
  transcription_delta TEXT,
  
  -- Audio metadata (if from recording)
  audio_duration_seconds INTEGER,
  audio_confidence NUMERIC,
  
  -- Complete transcription after this change
  cumulative_transcription TEXT NOT NULL,
  
  -- Metadata
  device_fingerprint TEXT,
  ip_address TEXT
);

CREATE INDEX idx_transcription_history_consult_id ON transcription_history(consult_id);
CREATE INDEX idx_transcription_history_clinic_id ON transcription_history(clinic_id);
CREATE INDEX idx_transcription_history_created_at ON transcription_history(created_at DESC);
CREATE INDEX idx_transcription_history_source_type ON transcription_history(source_type);

-- =====================================================
-- PHASE 3: Enhance reports_generated with version tracking
-- =====================================================

ALTER TABLE reports_generated 
ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS is_latest BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS regenerated_from UUID REFERENCES reports_generated(id),
ADD COLUMN IF NOT EXISTS regeneration_reason TEXT;

-- Create index for version queries
CREATE INDEX IF NOT EXISTS idx_reports_generated_version ON reports_generated(consult_id, report_type, version_number);
CREATE INDEX IF NOT EXISTS idx_reports_generated_is_latest ON reports_generated(consult_id, report_type) WHERE is_latest = true;

-- Function to manage report versions
CREATE OR REPLACE FUNCTION public.manage_report_versions()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Set version number for this consult + report_type combination
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO NEW.version_number
  FROM reports_generated
  WHERE consult_id = NEW.consult_id 
    AND report_type = NEW.report_type;
  
  -- Mark previous versions as not latest
  UPDATE reports_generated
  SET is_latest = false
  WHERE consult_id = NEW.consult_id 
    AND report_type = NEW.report_type
    AND id != NEW.id;
  
  NEW.is_latest := true;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_manage_report_versions
BEFORE INSERT ON reports_generated
FOR EACH ROW
EXECUTE FUNCTION manage_report_versions();

-- =====================================================
-- PHASE 4: Create comprehensive view for easy querying
-- =====================================================

CREATE OR REPLACE VIEW public.consult_complete_view AS
SELECT 
  c.id AS consult_id,
  c.clinic_id,
  c.patient_id,
  c.owner_id,
  c.vet_user_id,
  c.status,
  c.started_at,
  c.ended_at,
  c.finalized_at,
  c.reason_for_visit,
  c.visit_type,
  
  -- Patient info
  p.name AS patient_name,
  p.species AS patient_species,
  p.breed AS patient_breed,
  p.sex AS patient_sex,
  p.date_of_birth AS patient_dob,
  p.weight_kg AS patient_weight_kg,
  p.weight_lb AS patient_weight_lb,
  p.alerts AS patient_alerts,
  p.identifiers AS patient_identifiers,
  
  -- Owner info
  o.name AS owner_name,
  o.email AS owner_email,
  o.phone AS owner_phone,
  o.address AS owner_address,
  
  -- Vet info
  pr.name AS vet_name,
  pr.email AS vet_email,
  pr.name_prefix AS vet_prefix,
  
  -- Clinic info
  cl.name AS clinic_name,
  cl.address AS clinic_address,
  cl.phone AS clinic_phone,
  cl.timezone AS clinic_timezone,
  
  -- Transcription
  c.original_input AS transcription,
  c.transcription_method,
  c.audio_duration_seconds,
  c.transcription_confidence,
  
  -- SOAP sections
  c.soap_s,
  c.soap_o,
  c.soap_a,
  c.soap_p,
  
  -- Vitals
  c.weight_kg AS consult_weight_kg,
  c.weight_lb AS consult_weight_lb,
  c.vitals_temperature_f,
  c.vitals_temperature_c,
  c.vitals_heart_rate,
  c.vitals_respiratory_rate,
  c.vitals_pain_score,
  c.vitals_body_condition_score,
  
  -- Wellness/Procedure data
  c.case_notes,
  c.discharge_summary,
  c.client_education,
  
  -- Report counts
  (SELECT COUNT(*) FROM reports_generated rg WHERE rg.consult_id = c.id) AS total_reports_generated,
  (SELECT COUNT(*) FROM reports_generated rg WHERE rg.consult_id = c.id AND rg.report_type = 'soap') AS soap_report_count,
  (SELECT COUNT(*) FROM reports_generated rg WHERE rg.consult_id = c.id AND rg.report_type = 'wellness') AS wellness_report_count,
  (SELECT COUNT(*) FROM reports_generated rg WHERE rg.consult_id = c.id AND rg.report_type = 'procedure') AS procedure_report_count,
  
  -- Audio segment count
  (SELECT COUNT(*) FROM consult_audio_segments cas WHERE cas.consult_id = c.id) AS audio_segment_count,
  
  -- History snapshot count
  (SELECT COUNT(*) FROM consult_history ch WHERE ch.consult_id = c.id) AS history_snapshot_count,
  
  -- Transcription history count
  (SELECT COUNT(*) FROM transcription_history th WHERE th.consult_id = c.id) AS transcription_history_count,
  
  -- Timestamps
  c.created_at,
  c.updated_at

FROM consults c
LEFT JOIN patients p ON c.patient_id = p.id
LEFT JOIN owners o ON c.owner_id = o.id
LEFT JOIN profiles pr ON c.vet_user_id = pr.user_id
LEFT JOIN clinics cl ON c.clinic_id = cl.id;

-- =====================================================
-- PHASE 5: Automatic snapshot trigger
-- =====================================================

CREATE OR REPLACE FUNCTION public.capture_consult_snapshot()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_version INTEGER;
  v_patient RECORD;
  v_owner RECORD;
  v_vet RECORD;
  v_snapshot_type TEXT;
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
  SELECT * INTO v_vet FROM profiles WHERE user_id = NEW.vet_user_id;
  
  -- Insert snapshot
  INSERT INTO consult_history (
    consult_id, clinic_id, patient_id, owner_id, vet_user_id,
    snapshot_type, version_number, created_by,
    patient_name, patient_species, patient_breed, patient_weight_kg, patient_age,
    owner_name, owner_email, owner_phone,
    vet_name, vet_email,
    transcription_complete, transcription_method, audio_duration_seconds,
    soap_s, soap_o, soap_a, soap_p,
    wellness_data, procedure_data,
    vitals, case_notes_json, reason_for_visit, status
  ) VALUES (
    NEW.id, NEW.clinic_id, NEW.patient_id, NEW.owner_id, NEW.vet_user_id,
    v_snapshot_type, v_version, auth.uid(),
    v_patient.name, v_patient.species, v_patient.breed, v_patient.weight_kg, v_patient.age,
    v_owner.name, v_owner.email, v_owner.phone,
    v_vet.name, v_vet.email,
    NEW.original_input, NEW.transcription_method, NEW.audio_duration_seconds,
    NEW.soap_s, NEW.soap_o, NEW.soap_a, NEW.soap_p,
    (NEW.case_notes::jsonb)->'wellness',
    (NEW.case_notes::jsonb)->'procedure',
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
    NEW.case_notes::jsonb,
    NEW.reason_for_visit,
    NEW.status
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_capture_consult_snapshot
AFTER INSERT OR UPDATE ON consults
FOR EACH ROW
EXECUTE FUNCTION capture_consult_snapshot();

-- =====================================================
-- PHASE 6: RLS Policies for new tables
-- =====================================================

-- consult_history RLS
ALTER TABLE consult_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their clinic consult history"
  ON consult_history FOR SELECT
  TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "System can insert consult history"
  ON consult_history FOR INSERT
  TO authenticated
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

-- transcription_history RLS
ALTER TABLE transcription_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their clinic transcription history"
  ON transcription_history FOR SELECT
  TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert transcription history for their clinic"
  ON transcription_history FOR INSERT
  TO authenticated
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

-- =====================================================
-- PHASE 7: Enable realtime for history tables (optional)
-- =====================================================

ALTER PUBLICATION supabase_realtime ADD TABLE consult_history;
ALTER PUBLICATION supabase_realtime ADD TABLE transcription_history;