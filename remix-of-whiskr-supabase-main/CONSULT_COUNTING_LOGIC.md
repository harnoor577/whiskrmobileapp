# Consult Counting Logic - Complete System

This document explains how consult counting works across all scenarios for Basic, Professional, Trial, and Master Admin granted accounts.

## Core Components

### 1. Database Columns (clinics table)
- `consults_used_this_period` - Current consults used this month
- `consults_cap` - Monthly limit for paid plans (100 for Basic, 200 for Professional)
- `trial_consults_cap` - Monthly limit for trial accounts (default: 25)
- `grace_consults_used` - Grace consults used (0-5 after reaching cap)
- `billing_cycle_start_date` - Start date of current billing cycle
- `notification_80_sent` - Email sent when reaching 80% usage
- `notification_95_sent` - Email sent when reaching 95% usage
- `subscription_status` - 'trial', 'active', 'cancelled', 'free'
- `subscription_tier` - 'basic', 'professional', 'enterprise', 'free'
- `stripe_subscription_id` - Stripe subscription identifier

### 2. Key Functions

#### `increment_consult_count()`
- Triggered on every new consult insert
- Increments `consults_used_this_period` if under cap
- Uses grace consults (1-5) if cap reached
- Checks and triggers 80% and 95% email notifications
- Does NOT increment for enterprise (unlimited)

#### `add_consults_to_cap(clinic_uuid, additional_consults)`
- Master Admin tool to grant extra consults
- **ADDS to the cap**, does NOT reset usage
- Works for both trial and paid accounts
- Example: If cap is 100 and you grant 50, new cap = 150
- Does NOT reset consults_used_this_period

#### `sync-subscription` (Edge Function)
- Called when user logs in or manually refreshes status
- Syncs with Stripe to get latest subscription status
- **Detects and handles 4 reset scenarios** (see below)

#### `reset_consults_on_rebilling(subscription_id, billing_cycle_start)`
- Called by Stripe webhook when invoice.payment_succeeded fires
- Resets consults_used_this_period = 0
- Resets grace_consults_used = 0
- Resets notification flags
- Updates billing_cycle_start_date to new period

## Scenarios That Reset Consults to Zero

### ✅ Scenario 1: User Upgrades (Basic → Professional)
**When:** User changes from Basic ($49) to Professional ($97) plan
**Trigger:** `sync-subscription` detects `isPlanChange = true`
**What Happens:**
- ✅ `consults_used_this_period = 0`
- ✅ `consults_cap = 200` (Professional limit)
- ✅ `grace_consults_used = 0`
- ✅ `notification_80_sent = false`
- ✅ `notification_95_sent = false`
- ✅ `billing_cycle_start_date` = Stripe's current period start
- 📝 **Reason:** Fresh start with new plan benefits

**Detection Logic:**
```typescript
const isPlanChange = currentClinic.subscription_tier !== tier && 
                     currentClinic.subscription_tier !== 'trial';
```

### ✅ Scenario 2: User Downgrades (Professional → Basic)
**When:** User changes from Professional ($97) to Basic ($49) plan
**Trigger:** `sync-subscription` detects `isPlanChange = true`
**What Happens:**
- ✅ `consults_used_this_period = 0`
- ✅ `consults_cap = 100` (Basic limit)
- ✅ `grace_consults_used = 0`
- ✅ `notification_80_sent = false`
- ✅ `notification_95_sent = false`
- ✅ `billing_cycle_start_date` = Stripe's current period start
- 📝 **Reason:** Fresh start to avoid immediate overage on downgrade

### ✅ Scenario 3: Monthly Rebilling (Stripe Charges Renewal)
**When:** Stripe charges monthly subscription renewal
**Trigger:** Stripe webhook `invoice.payment_succeeded` with `billing_reason = 'subscription_cycle'`
**What Happens:**
- ✅ `consults_used_this_period = 0`
- ✅ `grace_consults_used = 0`
- ✅ `notification_80_sent = false`
- ✅ `notification_95_sent = false`
- ✅ `billing_cycle_start_date` = New period start from Stripe
- 📝 **Reason:** New billing period = new consult allowance
- ⚠️ **Note:** Consults DO NOT roll over

**Detection Logic (in webhook):**
```typescript
if (invoice.billing_reason === 'subscription_cycle') {
  await resetConsultsOnRebilling(subscription.id, newPeriodStart);
}
```

**Detection Logic (in sync-subscription as backup):**
```typescript
const isBillingReset = Math.abs(
  stripeBillingStart.getTime() - currentBillingStart.getTime()
) > (24 * 60 * 60 * 1000); // More than 1 day difference
```

### ✅ Scenario 4: Subscription Change (Cancellation + New Subscription)
**When:** User cancels and creates a new subscription (different subscription ID)
**Trigger:** `sync-subscription` detects `isSubscriptionChange = true`
**What Happens:**
- ✅ `consults_used_this_period = 0`
- ✅ `consults_cap` = New plan's limit
- ✅ `grace_consults_used = 0`
- ✅ `notification_80_sent = false`
- ✅ `notification_95_sent = false`
- ✅ `billing_cycle_start_date` = New subscription start
- 📝 **Reason:** Completely new subscription

**Detection Logic:**
```typescript
const isSubscriptionChange = currentClinic.stripe_subscription_id && 
  currentClinic.stripe_subscription_id !== selectable.id;
```

## Scenarios That DO NOT Reset Consults

### ❌ Master Admin Grants Consults
**When:** Master admin uses "Grant Consults" in admin panel
**What Happens:**
- ❌ `consults_used_this_period` stays the same (NOT reset)
- ✅ `consults_cap` increases by granted amount
- ✅ All notification flags remain unchanged
- 📝 **Example:** User has 85/100 consults. Admin grants 50. Result: 85/150 consults.

**Function:** `add_consults_to_cap(clinic_uuid, additional_consults)`
```sql
UPDATE clinics
SET consults_cap = consults_cap + additional_consults
WHERE id = clinic_uuid;
-- Does NOT touch consults_used_this_period
```

### ❌ User Logs In / Refreshes Status
**When:** User logs in and sync-subscription runs
**What Happens IF no plan/billing changes:**
- ❌ `consults_used_this_period` preserved
- ❌ `billing_cycle_start_date` preserved
- ✅ Stripe subscription status synced
- ✅ Subscription tier updated if needed
- 📝 **Reason:** Normal sync shouldn't lose progress

## Email Notification System

### 80% Threshold
- **Trigger:** When `consults_used / consults_cap >= 80%`
- **Email Content:** Warning with usage stats and upgrade CTA
- **Flag:** `notification_80_sent = true` (prevents duplicate emails)
- **Recipients:** All users with admin role in the clinic

### 95% Threshold
- **Trigger:** When `consults_used / consults_cap >= 95%`
- **Email Content:** Urgent warning + grace period explanation
- **Flag:** `notification_95_sent = true`
- **Recipients:** All users with admin role in the clinic

### Notification Reset
- Flags reset to `false` on billing cycle reset
- Allows notifications to fire again next month

## Grace Period System

### How It Works
1. User creates consult #100 (reaches cap on 100-consult plan)
2. Next consult (#101) uses grace consult 1/5
3. User can create 5 more consults (total 105)
4. After grace consult 5/5 is used, no more consults allowed

### UI Indicators
- **Normal:** "85 / 100 consults" (blue progress bar)
- **At Cap + Grace:** "Grace Period: 3 of 5 grace consults used" (amber alert)
- **Exceeded:** "You've used all 100 consults + 5 grace consults" (red alert)

### Database Tracking
- `grace_consults_used` column (0-5)
- Resets to 0 on billing cycle reset

## Stripe Webhook Handler

### Setup Required
1. Create webhook endpoint in Stripe Dashboard
2. Point to: `https://[your-project].supabase.co/functions/v1/stripe-webhook-handler`
3. Select events: `invoice.payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Add webhook secret to environment: `STRIPE_WEBHOOK_SECRET`

### Events Handled
- **invoice.payment_succeeded:** Resets consults on monthly rebilling
- **customer.subscription.updated:** Logs plan changes for audit
- **customer.subscription.deleted:** Updates status to cancelled

## Testing Scenarios

### Test 1: Upgrade
1. User on Basic (85/100 consults used)
2. User upgrades to Professional
3. Result: 0/200 consults (fresh start)

### Test 2: Downgrade
1. User on Professional (150/200 consults used)
2. User downgrades to Basic
3. Result: 0/100 consults (fresh start)

### Test 3: Rebilling
1. User on Basic (85/100 consults used)
2. Stripe charges monthly renewal (30 days pass)
3. Result: 0/100 consults (new month)

### Test 4: Master Admin Grant
1. User on Basic (85/100 consults used)
2. Admin grants 50 consults
3. Result: 85/150 consults (cap increased, usage preserved)

### Test 5: Grace Period
1. User on Basic (100/100 consults used)
2. User creates 3 more consults
3. Result: 100/100 consults + 3/5 grace consults used
4. User can create 2 more before being blocked

## Summary

| Scenario | Consults Reset? | Cap Updated? | Flags Reset? | Billing Date Updated? |
|----------|----------------|--------------|--------------|----------------------|
| **Upgrade Plan** | ✅ Yes (0) | ✅ Yes (higher) | ✅ Yes | ✅ Yes |
| **Downgrade Plan** | ✅ Yes (0) | ✅ Yes (lower) | ✅ Yes | ✅ Yes |
| **Monthly Rebilling** | ✅ Yes (0) | ❌ No | ✅ Yes | ✅ Yes |
| **Subscription Change** | ✅ Yes (0) | ✅ Yes (new) | ✅ Yes | ✅ Yes |
| **Master Admin Grant** | ❌ No | ✅ Yes (add) | ❌ No | ❌ No |
| **User Login/Sync** | ❌ No | ❌ No | ❌ No | ❌ No |
| **Grace Period Used** | ❌ No | ❌ No | ❌ No | ❌ No |

## Edge Cases Handled

1. **User upgrades mid-month:** Fresh start prevents "already used" confusion
2. **User downgrades mid-month:** Fresh start prevents immediate overage
3. **Stripe webhook fails:** sync-subscription detects billing reset on next login
4. **Multiple subscription changes:** Each change tracked with audit log
5. **Complimentary trial granted:** Works with same logic as paid accounts
6. **Enterprise tier:** Bypasses all counting (unlimited)

## Audit Trail

All major events are logged in `audit_events` table:
- Plan changes (upgrade/downgrade)
- Consult grants by master admin
- Billing cycle resets
- Notification emails sent (in `consult_usage_notifications` table)

## Maintenance

### Monthly Cleanup (Recommended Cron Job)
Run daily to catch any missed resets:
```sql
SELECT reset_billing_cycle_notifications();
```

This finds clinics where `billing_cycle_start_date + 30 days < now()` and resets them.
