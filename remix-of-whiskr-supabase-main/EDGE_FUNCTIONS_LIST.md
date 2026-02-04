# GrowDVM AI - Edge Functions Reference

## Overview
This project uses 28 Supabase Edge Functions (Deno-based serverless functions) for backend logic. All functions are automatically deployed when you remix the project.

---

## Core AI Functions

### 1. `transcribe-audio`
**Purpose:** Converts voice recordings to text using OpenAI Whisper API
- **Input:** Audio file (base64 encoded), language, consultId
- **Output:** Transcribed text and duration
- **Secrets:** `OPENAI_API_KEY`
- **Used In:** Voice recorder during consults
- **Rate Limit:** 25MB audio file limit

### 2. `generate-soap`
**Purpose:** Generates structured SOAP notes from chat conversation
- **Input:** consultId (fetches chat messages)
- **Output:** { subjective, objective, assessment, plan }
- **Secrets:** `OPENAI_API_KEY`
- **Used In:** ConsultWorkspace after dictation
- **AI Model:** GPT-4 or configured model

### 3. `chat-assistant`
**Purpose:** AI veterinary assistant for diagnostic help
- **Input:** Messages array, consultId
- **Output:** AI response with medical guidance
- **Secrets:** `OPENAI_API_KEY`
- **Used In:** Chat interface in ConsultWorkspace
- **Features:** Context-aware, SOAP history integration

### 4. `analyze-document`
**Purpose:** Analyzes diagnostic images (X-rays, ultrasounds, bloodwork)
- **Input:** File ID, optional custom prompt
- **Output:** Analysis JSON, OCR text, findings
- **Secrets:** `OPENAI_API_KEY` (GPT-4V)
- **Used In:** Diagnostics page file upload
- **Supports:** Images, PDFs, multi-modal analysis

### 5. `regenerate-evaluation`
**Purpose:** Re-analyzes a diagnostic file with new prompt
- **Input:** fileId, newPrompt
- **Output:** Updated analysis JSON
- **Secrets:** `OPENAI_API_KEY`
- **Used In:** Diagnostics detail view

---

## Authentication Functions

### 6. `send-auth-email`
**Purpose:** Sends authentication emails (password reset, welcome)
- **Input:** Email, type, data (reset token, etc.)
- **Output:** Email sent confirmation
- **Secrets:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- **Used In:** Login, password reset flows

### 7. `send-auth-otp`
**Purpose:** Sends 2FA OTP codes for master admin login
- **Input:** Email
- **Output:** OTP sent confirmation
- **Secrets:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- **Used In:** Master admin login (super_admin role)
- **Security:** 10-minute expiration, rate limited

### 8. `verify-master-admin`
**Purpose:** Validates OTP or backup codes for master admin
- **Input:** Email, OTP or backup code
- **Output:** Valid/invalid status
- **Used In:** Master admin 2FA verification

### 9. `generate-backup-codes`
**Purpose:** Generates 10 backup codes for master admin MFA
- **Input:** Email
- **Output:** Array of 10 codes
- **Rate Limit:** 2 generations per 24 hours
- **Used In:** Master admin account setup

---

## User Management Functions

### 10. `create-team-user`
**Purpose:** Creates new team members within a clinic
- **Input:** Name, email, phone, role
- **Output:** User created confirmation
- **Secrets:** `SUPABASE_SERVICE_ROLE_KEY`
- **Used In:** Admin panel user management
- **Enforces:** max_users limit per clinic

### 11. `send-invitation-email`
**Purpose:** Sends team invitation emails
- **Input:** Email, inviterName, clinicName
- **Output:** Email sent confirmation
- **Secrets:** `RESEND_API_KEY`
- **Used In:** Team user invitation flow

### 12. `upsert-device-session`
**Purpose:** Tracks active devices per user/clinic
- **Input:** Device fingerprint, IP, user agent
- **Output:** Session created/updated
- **Used In:** Login flow, device limit enforcement
- **Enforces:** max_devices per clinic

---

## Subscription & Billing Functions

### 13. `check-subscription`
**Purpose:** Validates Stripe subscription status
- **Input:** Auth token
- **Output:** Subscription status, tier, end date
- **Secrets:** `STRIPE_SECRET_KEY`
- **Used In:** Billing page, subscription checks

### 14. `create-checkout`
**Purpose:** Creates Stripe checkout session for new subscriptions
- **Input:** priceId (e.g., price_basic_monthly)
- **Output:** Checkout session URL
- **Secrets:** `STRIPE_SECRET_KEY`
- **Used In:** Billing page upgrade flow

### 15. `customer-portal`
**Purpose:** Redirects to Stripe customer portal for managing subscription
- **Input:** Auth token
- **Output:** Portal session URL
- **Secrets:** `STRIPE_SECRET_KEY`
- **Used In:** Billing page "Manage Subscription"

### 16. `check-device-limit`
**Purpose:** Enforces device limits based on subscription tier
- **Input:** userId, deviceFingerprint
- **Output:** Allow/deny access
- **Used In:** Login flow, device tracking

---

## Referral & Affiliate Functions

### 17. `generate-referral-code`
**Purpose:** Creates unique referral code for user
- **Input:** Auth token
- **Output:** Referral code (e.g., JOHN_R1234)
- **Secrets:** `STRIPE_SECRET_KEY` (creates coupon)
- **Used In:** Affiliate page

### 18. `process-referral-signup`
**Purpose:** Processes new signup with referral code
- **Input:** Referral code, user metadata
- **Output:** Referral tracked, extended trial
- **Used In:** Signup flow with ?ref= parameter

### 19. `award-referral-credit`
**Purpose:** Awards $50 credit to referrer when referee becomes paying
- **Input:** referralId, referrerId
- **Output:** Credit awarded
- **Max Credit:** $500 lifetime per user
- **Used In:** Webhook from Stripe (paying conversion)

---

## Support Functions

### 20. `send-support-notification`
**Purpose:** Notifies support agents of new tickets
- **Input:** ticketId, userId, clinicId
- **Output:** Notification created
- **Used In:** Support ticket creation

### 21. `notify-support-agent`
**Purpose:** Sends email to support agent about new ticket
- **Input:** agentEmail, ticketSubject, ticketId
- **Output:** Email sent
- **Secrets:** `RESEND_API_KEY`
- **Used In:** Support ticket assignment

### 22. `send-test-notification`
**Purpose:** Tests push notification system
- **Input:** userId, title, body
- **Output:** Notification sent
- **Used In:** Testing push notifications

---

## Clinical Workflow Functions

### 23. `process-case-note`
**Purpose:** Processes and analyzes case notes with AI
- **Input:** consultId, noteText
- **Output:** Structured case note
- **Secrets:** `OPENAI_API_KEY`
- **Used In:** ConsultWorkspace case notes

### 24. `generate-summary`
**Purpose:** Generates patient visit summary
- **Input:** consultId
- **Output:** Human-readable summary
- **Secrets:** `OPENAI_API_KEY`
- **Used In:** Consult finalization

### 25. `send-treatment-plan`
**Purpose:** Emails treatment plan to pet owner
- **Input:** consultId, ownerEmail
- **Output:** Email sent
- **Secrets:** `RESEND_API_KEY`
- **Used In:** Post-consult communication

### 26. `notify-diagnostics-needed`
**Purpose:** Notifies vet when diagnostics are uploaded
- **Input:** consultId, fileId
- **Output:** Notification created
- **Used In:** Diagnostic file upload

---

## Utility Functions

### 27. `city-autocomplete`
**Purpose:** Provides city name autocomplete
- **Input:** Search term, country
- **Output:** City suggestions
- **Secrets:** `VITE_GOOGLE_MAPS_API_KEY`
- **Used In:** Signup form location field

### 28. `rename-file`
**Purpose:** Renames diagnostic files in storage
- **Input:** fileId, newName
- **Output:** File renamed
- **Used In:** Diagnostics file management

### 29. `get-diagnostic-pdf`
**Purpose:** Retrieves generated PDF for diagnostic report
- **Input:** fileId
- **Output:** PDF URL or pending status
- **Used In:** Diagnostics report download

### 30. `get-vapid-public-key`
**Purpose:** Returns VAPID public key for push notifications
- **Input:** None
- **Output:** Public key
- **Secrets:** `VITE_VAPID_PUBLIC_KEY`
- **Used In:** Push notification subscription

### 31. `save-push-subscription`
**Purpose:** Saves browser push notification subscription
- **Input:** Subscription object, userId, clinicId
- **Output:** Subscription saved
- **Used In:** Push notification setup

---

## Shared Utilities

### `_shared/rateLimiter.ts`
**Purpose:** Rate limiting utility for all edge functions
- **Features:** IP-based limits, action-specific rules, lockout mechanism
- **Used By:** All auth and critical functions

---

## Edge Function Configuration

All functions are configured in `supabase/config.toml`:

```toml
[functions]
verify_jwt = false  # Most functions require auth
```

Individual function configuration:
- **Memory:** 256MB default
- **Timeout:** 60s default
- **Region:** Auto (nearest to user)

---

## Testing Edge Functions

Use the Lovable backend logs to debug:
1. Go to Backend → Functions
2. Select function to view logs
3. Check for errors, API key issues, rate limits

Common issues:
- ❌ "API key not found" → Add secret
- ❌ "Rate limit exceeded" → Wait or adjust limits
- ❌ "CORS error" → Check origin headers
- ❌ "Timeout" → Check external API response time

---

## Secrets Required by Function

| Function | Required Secrets |
|----------|-----------------|
| `transcribe-audio` | `OPENAI_API_KEY` |
| `generate-soap` | `OPENAI_API_KEY` |
| `chat-assistant` | `OPENAI_API_KEY`, `PINECONE_API_KEY` (optional) |
| `analyze-document` | `OPENAI_API_KEY` |
| `send-auth-email` | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| `send-auth-otp` | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| `create-checkout` | `STRIPE_SECRET_KEY` |
| `customer-portal` | `STRIPE_SECRET_KEY` |
| `generate-referral-code` | `STRIPE_SECRET_KEY` |
| `send-support-notification` | `RESEND_API_KEY` |
| `send-treatment-plan` | `RESEND_API_KEY` |
| `city-autocomplete` | `VITE_GOOGLE_MAPS_API_KEY` |
| `save-push-subscription` | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |

---

## Monitoring & Debugging

**View Logs:**
```bash
# In Lovable backend dashboard
Backend → Functions → [function-name] → Logs
```

**Test Functions:**
```bash
# Use curl or Postman
curl https://[project-id].supabase.co/functions/v1/[function-name] \
  -H "Authorization: Bearer [anon-key]" \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'
```

**Rate Limit Status:**
Check `rate_limit_attempts` table for blocked IPs/emails.
