-- Add user_email column to consults table
ALTER TABLE public.consults 
ADD COLUMN user_email TEXT;

-- Backfill existing records from profiles
UPDATE public.consults c
SET user_email = p.email
FROM public.profiles p
WHERE c.vet_user_id = p.user_id
  AND c.user_email IS NULL;

-- Create trigger function to auto-sync user_email
CREATE OR REPLACE FUNCTION public.sync_consult_user_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.vet_user_id IS NOT NULL THEN
    SELECT email INTO NEW.user_email
    FROM public.profiles
    WHERE user_id = NEW.vet_user_id;
  ELSE
    NEW.user_email := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to execute on insert or update of vet_user_id
CREATE TRIGGER set_consult_user_email
  BEFORE INSERT OR UPDATE OF vet_user_id ON public.consults
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_consult_user_email();

-- Add index for performance
CREATE INDEX idx_consults_user_email ON public.consults(user_email);