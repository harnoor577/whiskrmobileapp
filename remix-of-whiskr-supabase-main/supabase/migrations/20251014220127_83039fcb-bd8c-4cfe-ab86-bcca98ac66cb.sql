-- Backfill missing profiles, clinics, and roles for existing users
DO $$
DECLARE
  r RECORD;
  cid uuid;
BEGIN
  -- Backfill profiles/clinics for users without a profile
  FOR r IN
    SELECT
      u.id as user_id,
      u.email,
      COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)) as name,
      COALESCE(u.raw_user_meta_data->>'phone', '') as phone,
      COALESCE(u.raw_user_meta_data->>'clinic_name', 'My Clinic') as clinic_name
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)
  LOOP
    -- Create clinic
    INSERT INTO public.clinics (name, phone, address)
      VALUES (r.clinic_name, r.phone, '')
      RETURNING id INTO cid;

    -- Create profile
    INSERT INTO public.profiles (user_id, clinic_id, name, email, phone)
      VALUES (r.user_id, cid, r.name, r.email, r.phone);
  END LOOP;

  -- Backfill roles for users without any role
  INSERT INTO public.user_roles (user_id, role)
  SELECT u.id, 'admin'::app_role
  FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id);
END $$;