-- Add original_input column to store transcription or form data for display in case summary
ALTER TABLE public.consults ADD COLUMN IF NOT EXISTS original_input TEXT;