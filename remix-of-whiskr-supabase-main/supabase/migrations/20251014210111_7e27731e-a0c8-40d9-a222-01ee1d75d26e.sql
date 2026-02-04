-- Create user roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'veterinarian', 'support_staff');

-- Create user roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Clinics table
CREATE TABLE public.clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  address TEXT,
  phone TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  header_logo_url TEXT,
  brand_colors JSONB DEFAULT '{"primary": "#1E40AF", "secondary": "#059669"}'::jsonb,
  data_residency TEXT DEFAULT 'us' CHECK (data_residency IN ('us', 'ca')),
  retention_days INTEGER DEFAULT 90,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  mfa_enabled BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Owners table
CREATE TABLE public.owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;

-- Patients table
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
  owner_id UUID REFERENCES public.owners(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  species TEXT NOT NULL,
  breed TEXT,
  sex TEXT CHECK (sex IN ('male', 'female', 'unknown')),
  date_of_birth DATE,
  identifiers JSONB DEFAULT '{}'::jsonb,
  alerts TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- Consults table
CREATE TABLE public.consults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  owner_id UUID REFERENCES public.owners(id) ON DELETE CASCADE NOT NULL,
  vet_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_sec INTEGER,
  soap_s TEXT,
  soap_o TEXT,
  soap_a TEXT,
  soap_p TEXT,
  history_summary TEXT,
  version INTEGER DEFAULT 1,
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.consults ENABLE ROW LEVEL SECURITY;

-- File assets table
CREATE TABLE public.file_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
  consult_id UUID REFERENCES public.consults(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('audio', 'pdf', 'image', 'other')),
  size_bytes BIGINT,
  mime_type TEXT,
  storage_key TEXT NOT NULL,
  ocr_text TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.file_assets ENABLE ROW LEVEL SECURITY;

-- Tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
  consult_id UUID REFERENCES public.consults(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  source TEXT DEFAULT 'manual' CHECK (source IN ('ai', 'manual')),
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Audit events table
CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Templates table
CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('soap', 'discharge', 'report')),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  shared BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- Integration sync table
CREATE TABLE public.integration_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
  consult_id UUID REFERENCES public.consults(id) ON DELETE CASCADE NOT NULL,
  target TEXT NOT NULL CHECK (target IN ('ezyvet')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'error')),
  response JSONB,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_sync ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for clinics
CREATE POLICY "Users can view their clinic"
  ON public.clinics FOR SELECT
  USING (id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can update their clinic"
  ON public.clinics FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') AND id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

-- RLS Policies for profiles
CREATE POLICY "Users can view profiles in their clinic"
  ON public.profiles FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage profiles in their clinic"
  ON public.profiles FOR ALL
  USING (public.has_role(auth.uid(), 'admin') AND clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

-- RLS Policies for owners
CREATE POLICY "Users can view owners in their clinic"
  ON public.owners FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Vets and admins can manage owners"
  ON public.owners FOR ALL
  USING (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'veterinarian'))
  );

-- RLS Policies for patients
CREATE POLICY "Users can view patients in their clinic"
  ON public.patients FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Vets and admins can manage patients"
  ON public.patients FOR ALL
  USING (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'veterinarian'))
  );

-- RLS Policies for consults
CREATE POLICY "Users can view consults in their clinic"
  ON public.consults FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Vets and admins can create consults"
  ON public.consults FOR INSERT
  WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'veterinarian'))
  );

CREATE POLICY "Vets and admins can update consults"
  ON public.consults FOR UPDATE
  USING (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'veterinarian'))
  );

-- RLS Policies for file_assets
CREATE POLICY "Users can view files in their clinic"
  ON public.file_assets FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can upload files to their clinic"
  ON public.file_assets FOR INSERT
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

-- RLS Policies for tasks
CREATE POLICY "Users can view tasks in their clinic"
  ON public.tasks FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage tasks in their clinic"
  ON public.tasks FOR ALL
  USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

-- RLS Policies for audit_events
CREATE POLICY "Admins can view audit events"
  ON public.audit_events FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    AND clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
  );

-- RLS Policies for templates
CREATE POLICY "Users can view templates in their clinic"
  ON public.templates FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins and vets can manage templates"
  ON public.templates FOR ALL
  USING (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'veterinarian'))
  );

-- RLS Policies for integration_sync
CREATE POLICY "Admins can view integration sync"
  ON public.integration_sync FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    AND clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Update triggers for timestamp columns
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_clinics_updated_at BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_owners_updated_at BEFORE UPDATE ON public.owners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_consults_updated_at BEFORE UPDATE ON public.consults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();