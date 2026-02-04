# Push Notifications Setup Guide

This app uses Web Push Notifications to alert users about case updates in real-time.

## Setup Steps

### 1. Generate VAPID Keys

VAPID keys are required for web push notifications. Generate them using this command:

```bash
npx web-push generate-vapid-keys
```

This will output:
```
=======================================
Public Key:
BMy5xXq...
Private Key:
...
=======================================
```

### 2. Update the Code

Add your **Public Key** to `src/lib/pushNotifications.ts`:

```typescript
// Replace this line:
const vapidPublicKey = 'YOUR_VAPID_PUBLIC_KEY_HERE';

// With your actual public key:
const vapidPublicKey = 'BMy5xXq...';
```

### 3. Add Private Key as Secret

The private key must be stored securely as a Supabase secret. In Lovable:

1. The AI assistant will help you add it as a secret
2. Name it: `VAPID_PRIVATE_KEY`
3. Paste your private VAPID private key

### 4. Configure Resend for Email Invitations

To send invitation emails:

1. Go to [resend.com](https://resend.com) and create an account
2. Verify your email domain at: https://resend.com/domains
3. Create an API key at: https://resend.com/api-keys
4. The RESEND_API_KEY is already configured in your secrets

### 5. Create Push Subscriptions Table

Run this migration:

```sql
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own subscriptions"
ON public.push_subscriptions
FOR ALL
TO authenticated
USING (user_id = auth.uid());
```

### 6. How It Works

1. **User enables notifications** on the Dashboard
2. **Browser requests permission** from the user
3. **Service worker** (`public/sw.js`) registers for push events
4. **Subscription is saved** to the database
5. **Backend sends notifications** when case updates occur

### 7. Testing Notifications

To test, you can send a test notification from the browser console:

```javascript
// In browser dev tools console:
navigator.serviceWorker.ready.then(registration => {
  return registration.showNotification('Test Notification', {
    body: 'This is a test from GrowDVM AI',
    icon: '/favicon.ico',
  });
});
```

### 8. Sending Notifications from Backend

Create an edge function to send notifications when cases are updated:

```typescript
import webPush from 'npm:web-push';

// Configure web-push
webPush.setVapidDetails(
  'mailto:your-email@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY'),
  Deno.env.get('VAPID_PRIVATE_KEY')
);

// Send notification
await webPush.sendNotification(
  subscription,
  JSON.stringify({
    title: 'Case Updated',
    body: 'SOAP note completed for patient Max',
    data: { url: '/consults/123' }
  })
);
```

## Browser Support

- ✅ Chrome/Edge (desktop & Android)
- ✅ Firefox (desktop & Android)
- ✅ Safari 16.4+ (iOS & macOS)
- ❌ Older iOS versions (pre-16.4)

## Troubleshooting

**Notifications not working?**

1. Check browser permissions (chrome://settings/content/notifications)
2. Ensure service worker is registered (DevTools > Application > Service Workers)
3. Check console for errors
4. Verify VAPID keys are correctly configured

**Email invitations not sending?**

1. Verify domain in Resend dashboard
2. Check edge function logs for errors
3. Ensure RESEND_API_KEY is configured

For more help, check the edge function logs in the Lovable Cloud dashboard.
