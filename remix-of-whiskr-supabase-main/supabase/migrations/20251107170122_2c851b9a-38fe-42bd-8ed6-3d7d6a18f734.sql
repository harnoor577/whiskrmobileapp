-- Add vitals columns to consults table
ALTER TABLE public.consults
ADD COLUMN IF NOT EXISTS vitals_temperature_f NUMERIC,
ADD COLUMN IF NOT EXISTS vitals_temperature_c NUMERIC,
ADD COLUMN IF NOT EXISTS vitals_heart_rate INTEGER,
ADD COLUMN IF NOT EXISTS vitals_respiratory_rate INTEGER,
ADD COLUMN IF NOT EXISTS vitals_body_condition_score TEXT,
ADD COLUMN IF NOT EXISTS vitals_dehydration_percent TEXT,
ADD COLUMN IF NOT EXISTS vitals_pain_score INTEGER,
ADD COLUMN IF NOT EXISTS vitals_crt TEXT,
ADD COLUMN IF NOT EXISTS vitals_mucous_membranes TEXT,
ADD COLUMN IF NOT EXISTS vitals_attitude TEXT,
ADD COLUMN IF NOT EXISTS vitals_last_updated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS vitals_last_updated_by UUID REFERENCES auth.users(id);

-- Add comment for documentation
COMMENT ON COLUMN public.consults.vitals_temperature_f IS 'Temperature in Fahrenheit';
COMMENT ON COLUMN public.consults.vitals_temperature_c IS 'Temperature in Celsius';
COMMENT ON COLUMN public.consults.vitals_heart_rate IS 'Heart rate in beats per minute';
COMMENT ON COLUMN public.consults.vitals_respiratory_rate IS 'Respiratory rate in breaths per minute';
COMMENT ON COLUMN public.consults.vitals_body_condition_score IS 'Body condition score (e.g., Normal, Overweight, Underweight)';
COMMENT ON COLUMN public.consults.vitals_dehydration_percent IS 'Dehydration percentage or status (e.g., Normal, 5%, 8%)';
COMMENT ON COLUMN public.consults.vitals_pain_score IS 'Pain score from 0-10';
COMMENT ON COLUMN public.consults.vitals_crt IS 'Capillary refill time (e.g., Normal, <2s, Delayed)';
COMMENT ON COLUMN public.consults.vitals_mucous_membranes IS 'Mucous membrane status (e.g., Normal, Pale, Injected)';
COMMENT ON COLUMN public.consults.vitals_attitude IS 'Patient attitude (e.g., Bright, alert, responsive; Dull; Depressed)';