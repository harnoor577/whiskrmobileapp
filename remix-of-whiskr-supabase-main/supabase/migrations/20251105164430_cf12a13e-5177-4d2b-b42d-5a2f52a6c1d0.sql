-- Add unit_preference column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN unit_preference text CHECK (unit_preference IN ('metric', 'imperial', 'both'));

COMMENT ON COLUMN public.profiles.unit_preference IS 'User preference for unit system: metric, imperial, both, or NULL for clinic default';