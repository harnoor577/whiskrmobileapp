-- Add analysis fields to file_assets table
ALTER TABLE public.file_assets
ADD COLUMN IF NOT EXISTS analysis_json JSONB,
ADD COLUMN IF NOT EXISTS document_type TEXT,
ADD COLUMN IF NOT EXISTS modality TEXT,
ADD COLUMN IF NOT EXISTS confidence NUMERIC;

-- Add last_analysis_at to consults table
ALTER TABLE public.consults
ADD COLUMN IF NOT EXISTS last_analysis_at TIMESTAMP WITH TIME ZONE;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_file_assets_document_type ON public.file_assets(document_type);
CREATE INDEX IF NOT EXISTS idx_consults_last_analysis_at ON public.consults(last_analysis_at);