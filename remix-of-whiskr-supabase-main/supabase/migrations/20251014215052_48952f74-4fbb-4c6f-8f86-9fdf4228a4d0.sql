-- Fix infinite recursion in profiles RLS policies
DROP POLICY IF EXISTS "Users can view profiles in their clinic" ON profiles;
DROP POLICY IF EXISTS "Admins can manage profiles in their clinic" ON profiles;

-- Create corrected policies that don't reference profiles table recursively
CREATE POLICY "Users can view their own profile"
ON profiles FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can view profiles in same clinic"
ON profiles FOR SELECT
USING (
  clinic_id IN (
    SELECT p.clinic_id 
    FROM profiles p 
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage profiles"
ON profiles FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) AND
  clinic_id IN (
    SELECT p.clinic_id 
    FROM profiles p 
    WHERE p.user_id = auth.uid()
  )
);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_clinic_id uuid;
BEGIN
  -- Create a new clinic for the user
  INSERT INTO public.clinics (name, phone, address)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'clinic_name', 'My Clinic'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    ''
  )
  RETURNING id INTO new_clinic_id;

  -- Create profile
  INSERT INTO public.profiles (user_id, clinic_id, name, email, phone)
  VALUES (
    NEW.id,
    new_clinic_id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  );

  -- Assign admin role by default
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin'::app_role);

  RETURN NEW;
END;
$$;

-- Create trigger for new user signups
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create chat_messages table for n8n chatbot history
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  consult_id uuid REFERENCES public.consults(id),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Chat messages policies
CREATE POLICY "Users can view chat messages in their clinic"
ON public.chat_messages FOR SELECT
USING (
  clinic_id IN (
    SELECT p.clinic_id 
    FROM profiles p 
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create chat messages"
ON public.chat_messages FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  clinic_id IN (
    SELECT p.clinic_id 
    FROM profiles p 
    WHERE p.user_id = auth.uid()
  )
);