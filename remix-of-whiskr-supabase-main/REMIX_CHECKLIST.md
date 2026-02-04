# GrowDVM AI - Project Remix Checklist

## What Gets Copied Automatically ✅

When you remix this project, Lovable automatically copies:
- ✅ All frontend code (React components, pages, hooks)
- ✅ All styling (Tailwind, CSS, design tokens)
- ✅ All routing configuration
- ✅ Edge function code (but NOT deployed yet)
- ✅ Package dependencies
- ✅ Environment variable structure (but NOT values)

## What Does NOT Get Copied ❌

The remixed project gets a **fresh Lovable Cloud backend**, which means:
- ❌ Database schema (empty database)
- ❌ Database data (no patients, consults, users)
- ❌ Deployed edge functions (code is there, but not deployed)
- ❌ Secrets/API keys (must be reconfigured)
- ❌ Storage buckets (must be recreated)
- ❌ Authentication settings (must be reconfigured)

---

## Post-Remix Setup Steps

### Step 1: Remix the Project
1. Go to your current project settings
2. Click "Remix this project"
3. Name it: "GrowDVM AI - Workflow v2" (or your preferred name)
4. Wait for Lovable to create the new project

### Step 2: Run Master Migration
1. In the remixed project, use the Lovable database migration tool
2. Copy and paste the entire contents of `00_master_schema.sql`
3. Review the migration (it's safe - recreates your current schema)
4. Approve and execute
5. Wait for completion (~30 seconds)

### Step 3: Configure Authentication
1. Go to Backend → Authentication settings
2. Enable "Auto-confirm email signups" (for non-production)
3. Configure allowed email domains if needed

### Step 4: Create Storage Bucket
Run this SQL via migration tool:
```sql
-- Create diagnostic images bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('diagnostic-images', 'diagnostic-images', false);

-- RLS policies for diagnostic images
CREATE POLICY "Users can upload files to their clinic"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'diagnostic-images' AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can view files in their clinic"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'diagnostic-images' AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
  )
);
```

### Step 5: Add Required Secrets
Use the Lovable secrets manager to add:

**Essential (AI features won't work without these):**
- `OPENAI_API_KEY` - OpenAI API key for transcription and SOAP generation
- `RESEND_API_KEY` - For sending emails (OTP, invitations, support)
- `RESEND_FROM_EMAIL` - Your verified sender email

**For Billing (if testing payments):**
- `STRIPE_SECRET_KEY` - Stripe API key

**For Push Notifications (optional for testing):**
- `VAPID_PUBLIC_KEY` - Web push public key
- `VAPID_PRIVATE_KEY` - Web push private key

**For Vector Search (if using diagnostic similarity):**
- `PINECONE_API_KEY` - Pinecone API key
- `PINECONE_HOST` - Pinecone index host

### Step 6: Verify Edge Functions
All edge functions should auto-deploy. Verify these are working:
- `transcribe-audio` - Voice to text
- `generate-soap` - AI SOAP note generation
- `chat-assistant` - AI chat responses
- `analyze-document` - Diagnostic image analysis
- `send-auth-otp` - Master admin 2FA

### Step 7: Test Core Functionality

**Authentication Flow:**
1. Sign up a new test user
2. Verify email auto-confirms
3. Log in successfully
4. Check profile is created

**Clinical Workflow:**
1. Create a test patient (owner + patient)
2. Start a new consult
3. Use voice recorder to transcribe
4. Upload a diagnostic image
5. Generate SOAP note
6. Finalize consult

**Admin Features:**
1. Verify subscription tier shows correctly
2. Check trial expiration date
3. Test device limit tracking
4. Create a support ticket

---

## Differences Between Original and Remix

| Feature | Original Project | Remixed Project |
|---------|-----------------|-----------------|
| **Database** | Production data | Empty (fresh start) |
| **Users** | Real clinic accounts | None (test accounts only) |
| **Consults** | Historical records | None |
| **Secrets** | Production keys | Must reconfigure |
| **Stripe** | Live mode | Test mode recommended |
| **Domain** | lovable.app/... | New lovable.app URL |

---

## Common Issues & Solutions

### Issue: "Row-level security policy violated"
**Solution:** Ensure you're logged in. RLS policies require authentication.

### Issue: Edge function fails with "Missing API key"
**Solution:** Add the required secret (e.g., `OPENAI_API_KEY`) in Backend → Secrets.

### Issue: "Bucket not found" when uploading images
**Solution:** Run Step 4 to create the storage bucket.

### Issue: No email confirmation received
**Solution:** Enable "Auto-confirm email signups" in auth settings.

### Issue: "Consult cap reached" on first consult
**Solution:** Check `clinics` table - ensure `trial_consults_cap` is 25 and `consults_used_this_period` is 0.

---

## Testing Checklist

- [ ] User signup works
- [ ] User login works
- [ ] Profile displays correctly
- [ ] Can create patient
- [ ] Can start consult
- [ ] Voice transcription works
- [ ] Can upload diagnostic image
- [ ] AI chat responds
- [ ] SOAP generation works
- [ ] Can finalize consult
- [ ] Task creation works
- [ ] Notifications appear
- [ ] Device limit enforced
- [ ] Trial expiration shows
- [ ] Support ticket creation works

---

## Next Steps After Setup

Once everything is working:
1. **Make your workflow changes** in the remixed project
2. **Test thoroughly** with the checklist above
3. **Compare side-by-side** with original
4. **Decide which version to keep** or merge changes back

---

## Emergency Recovery

If something goes wrong with the remix:
1. Your **original project is untouched** - it still works
2. You can **delete the remix** and start over
3. The master migration file can be run again
4. No data is lost (original has all production data)

---

## Support

If you encounter issues:
1. Check edge function logs in Backend → Functions
2. Check database logs for RLS policy violations
3. Verify all secrets are configured
4. Test with a fresh incognito browser session
