-- Create table for rich transcription segments with speaker diarization
CREATE TABLE IF NOT EXISTS consult_transcription_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consult_id UUID NOT NULL REFERENCES consults(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id),
  sequence_number INTEGER NOT NULL,
  start_time NUMERIC NOT NULL,
  end_time NUMERIC NOT NULL,
  text TEXT NOT NULL,
  speaker TEXT DEFAULT 'unknown' CHECK (speaker IN ('vet', 'client', 'unknown')),
  speaker_id TEXT,
  confidence NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(consult_id, sequence_number)
);

-- Add index for fast lookups
CREATE INDEX idx_transcription_segments_consult ON consult_transcription_segments(consult_id);

-- RLS Policies
ALTER TABLE consult_transcription_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view segments in their clinic"
ON consult_transcription_segments FOR SELECT
USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Staff with edit permissions can manage segments"
ON consult_transcription_segments FOR ALL
USING (
  clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
  AND can_edit_clinical_data(auth.uid(), clinic_id)
);

CREATE POLICY "Super admins can view all segments"
ON consult_transcription_segments FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_transcription_segments_updated_at
BEFORE UPDATE ON consult_transcription_segments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();