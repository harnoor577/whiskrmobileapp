-- Add clinical_summary column to cache AI-generated concise summaries
ALTER TABLE consults 
ADD COLUMN IF NOT EXISTS clinical_summary TEXT;

COMMENT ON COLUMN consults.clinical_summary IS 
'AI-generated concise clinical summary for patient history display';