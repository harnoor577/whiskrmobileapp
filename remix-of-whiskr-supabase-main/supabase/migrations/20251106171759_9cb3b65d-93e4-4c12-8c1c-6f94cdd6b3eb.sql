-- Create visit type enum if it doesn't exist
DO $$ BEGIN
  CREATE TYPE public.visit_type AS ENUM (
    'wellness',
    'procedure',
    'sickness',
    'chronic'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add visit_type column if it doesn't exist
DO $$ BEGIN
  ALTER TABLE public.consults ADD COLUMN visit_type public.visit_type DEFAULT 'wellness';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Add exam_room column if it doesn't exist
DO $$ BEGIN
  ALTER TABLE public.consults ADD COLUMN exam_room TEXT;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Add clinic_location column if it doesn't exist
DO $$ BEGIN
  ALTER TABLE public.consults ADD COLUMN clinic_location TEXT;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Create function to check if user is DVM
CREATE OR REPLACE FUNCTION public.is_dvm_role(user_id UUID, clinic_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinic_roles cr
    WHERE cr.user_id = user_id
      AND cr.clinic_id = clinic_id
      AND cr.role = 'vet'
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = user_id
      AND ur.role IN ('admin', 'super_admin')
  );
$$;

-- Add RLS policy for INSERT (only DVMs can create)
DROP POLICY IF EXISTS "Only DVMs can create consults" ON public.consults;
CREATE POLICY "Only DVMs can create consults"
ON public.consults
FOR INSERT
TO authenticated
WITH CHECK (public.is_dvm_role(auth.uid(), clinic_id));

-- Add RLS policy for UPDATE (only DVMs can edit)
DROP POLICY IF EXISTS "Only DVMs can update consults" ON public.consults;
CREATE POLICY "Only DVMs can update consults"
ON public.consults
FOR UPDATE
TO authenticated
USING (public.is_dvm_role(auth.uid(), clinic_id));

-- Add RLS policy for DELETE (only DVMs can delete)
DROP POLICY IF EXISTS "Only DVMs can delete consults" ON public.consults;
CREATE POLICY "Only DVMs can delete consults"
ON public.consults
FOR DELETE
TO authenticated
USING (public.is_dvm_role(auth.uid(), clinic_id));