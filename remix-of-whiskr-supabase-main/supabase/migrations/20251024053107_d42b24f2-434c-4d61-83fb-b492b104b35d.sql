-- Add INSERT policies for OTP storage (service role should bypass RLS but let's be explicit)
-- Allow inserts without authentication for OTP storage
CREATE POLICY "Allow system to insert OTPs"
  ON public.master_admin_otps
  FOR INSERT
  WITH CHECK (true);

-- Allow inserts for backup codes
CREATE POLICY "Allow system to insert backup codes"
  ON public.master_admin_backup_codes
  FOR INSERT
  WITH CHECK (true);

-- Allow updates for verification
CREATE POLICY "Allow system to update OTPs"
  ON public.master_admin_otps
  FOR UPDATE
  USING (true);

CREATE POLICY "Allow system to update backup codes"
  ON public.master_admin_backup_codes
  FOR UPDATE
  USING (true);