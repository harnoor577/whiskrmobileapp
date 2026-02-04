-- Add case_notes field to consults table for post-finalization notes
ALTER TABLE public.consults
ADD COLUMN case_notes TEXT;

COMMENT ON COLUMN public.consults.case_notes IS 'Additional notes added after consultation is finalized';

-- Add pdf_path field to file_assets for storing generated diagnostic PDFs
ALTER TABLE public.file_assets
ADD COLUMN pdf_path TEXT;

COMMENT ON COLUMN public.file_assets.pdf_path IS 'Storage path for generated 2-page diagnostic PDF';