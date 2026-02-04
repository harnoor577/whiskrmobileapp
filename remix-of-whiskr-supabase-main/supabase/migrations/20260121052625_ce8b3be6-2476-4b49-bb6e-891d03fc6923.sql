-- Create RPC function for updating consult_history metadata from client
CREATE OR REPLACE FUNCTION update_consult_history_metadata(
  p_consult_id uuid,
  p_ip_address text,
  p_device_fingerprint text,
  p_device_name text,
  p_user_agent text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE consult_history
  SET 
    ip_address = COALESCE(ip_address, p_ip_address),
    device_fingerprint = COALESCE(device_fingerprint, p_device_fingerprint),
    device_name = COALESCE(device_name, p_device_name),
    user_agent = COALESCE(user_agent, p_user_agent)
  WHERE consult_id = p_consult_id
    AND created_by = auth.uid()
    AND ip_address IS NULL
    AND created_at > now() - interval '5 minutes';
END;
$$;

-- Create unified compliance audit trail view
CREATE OR REPLACE VIEW compliance_audit_trail AS
SELECT 
  'report_generated' as event_type,
  rg.id as record_id,
  rg.consult_id,
  rg.patient_id,
  rg.clinic_id,
  rg.user_id,
  rg.consented_at as event_at,
  rg.user_email,
  rg.patient_name,
  rg.report_type,
  rg.input_mode,
  rg.ip_address,
  rg.device_name,
  rg.device_fingerprint,
  rg.user_agent,
  rg.regeneration_reason,
  rg.is_latest,
  rg.transcription_length,
  rg.uploaded_files_count
FROM reports_generated rg

UNION ALL

SELECT
  'consult_' || ch.snapshot_type as event_type,
  ch.id as record_id,
  ch.consult_id,
  ch.patient_id,
  ch.clinic_id,
  ch.created_by as user_id,
  ch.created_at as event_at,
  ch.user_email,
  ch.patient_name,
  'consult_snapshot' as report_type,
  ch.transcription_method as input_mode,
  ch.ip_address,
  ch.device_name,
  ch.device_fingerprint,
  ch.user_agent,
  ch.snapshot_type as regeneration_reason,
  NULL::boolean as is_latest,
  NULL::integer as transcription_length,
  NULL::integer as uploaded_files_count
FROM consult_history ch;

-- Performance indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_reports_generated_consented_at 
  ON reports_generated(consented_at DESC);

CREATE INDEX IF NOT EXISTS idx_consult_history_created_at 
  ON consult_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_generated_user_id 
  ON reports_generated(user_id);

CREATE INDEX IF NOT EXISTS idx_reports_generated_patient_id 
  ON reports_generated(patient_id);

CREATE INDEX IF NOT EXISTS idx_consult_history_clinic_id 
  ON consult_history(clinic_id);