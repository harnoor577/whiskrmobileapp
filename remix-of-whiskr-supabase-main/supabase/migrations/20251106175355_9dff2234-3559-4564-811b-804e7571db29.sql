-- Drop the old visit_type constraint
ALTER TABLE public.consults 
DROP CONSTRAINT IF EXISTS consults_visit_type_check;

-- Add new constraint with correct values
ALTER TABLE public.consults 
ADD CONSTRAINT consults_visit_type_check 
CHECK (visit_type = ANY (ARRAY['wellness'::text, 'procedure'::text, 'sickness'::text, 'chronic'::text]));