-- Add transcription tracking columns to consults table
ALTER TABLE consults 
  ADD COLUMN IF NOT EXISTS transcription_method TEXT,
  ADD COLUMN IF NOT EXISTS audio_duration_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transcription_confidence NUMERIC(3,2);

-- Create audit table for transcription events
CREATE TABLE IF NOT EXISTS consult_audio_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consult_id UUID REFERENCES consults(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL,
  sequence_number INTEGER NOT NULL,
  transcription TEXT NOT NULL,
  confidence NUMERIC(3,2),
  duration_seconds INTEGER,
  method TEXT DEFAULT 'cloud',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL
);

-- RLS policies for consult_audio_segments
ALTER TABLE consult_audio_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own segments" ON consult_audio_segments
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can view own segments" ON consult_audio_segments
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_audio_segments_consult ON consult_audio_segments(consult_id);
CREATE INDEX IF NOT EXISTS idx_audio_segments_created ON consult_audio_segments(created_at DESC);