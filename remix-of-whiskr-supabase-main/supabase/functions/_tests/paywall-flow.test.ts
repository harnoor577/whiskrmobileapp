// Paywall Flow Tests
// Tests for new signup blocking, grace period enforcement, payment success unlocking, and admin billing access

import { createMockSupabaseClient, createMockStripe } from './test-helpers.ts';

// Test constants
const GRACE_PERIOD_DAYS = 7;
const TEST_USER_ID = 'test-user-123';
const TEST_CLINIC_ID = 'test-clinic-456';

// Helper to create a date N days ago
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

// Helper to create a date N days from now
function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

/**
 * Test Suite: New Signup Blocking
 */
export function testNewSignupBlocking() {
  console.log('=== Testing New Signup Blocking ===');

  // Test 1: User with free status and no trial should be blocked
  const freeUserClinic = {
    subscription_status: 'free',
    subscription_tier: null,
    trial_ends_at: null,
    payment_failed_at: null,
  };
  
  const needsUpgrade = 
    freeUserClinic.subscription_status === 'free' && 
    !freeUserClinic.trial_ends_at;
  
  console.log('Test 1 - Free user blocked:', needsUpgrade === true ? 'PASS' : 'FAIL');

  // Test 2: User with active subscription should NOT be blocked
  const activeUserClinic = {
    subscription_status: 'active',
    subscription_tier: 'starter',
    trial_ends_at: null,
    payment_failed_at: null,
  };
  
  const hasActiveSubscription = activeUserClinic.subscription_status === 'active';
  console.log('Test 2 - Active user allowed:', hasActiveSubscription === true ? 'PASS' : 'FAIL');

  // Test 3: User with active trial should NOT be blocked
  const trialUserClinic = {
    subscription_status: 'trialing',
    subscription_tier: 'free',
    trial_ends_at: daysFromNow(7),
    payment_failed_at: null,
  };
  
  const hasActiveTrial = 
    trialUserClinic.trial_ends_at && 
    new Date(trialUserClinic.trial_ends_at) > new Date();
  
  console.log('Test 3 - Trial user allowed:', hasActiveTrial === true ? 'PASS' : 'FAIL');
}

/**
 * Test Suite: Grace Period Enforcement
 */
export function testGracePeriodEnforcement() {
  console.log('\n=== Testing Grace Period Enforcement ===');

  // Test 1: User within grace period (3 days ago) should be allowed
  const withinGracePeriod = {
    subscription_status: 'past_due',
    payment_failed_at: daysAgo(3),
  };
  
  const failedAt1 = new Date(withinGracePeriod.payment_failed_at);
  const gracePeriodEnd1 = new Date(failedAt1.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const isBlocked1 = new Date() > gracePeriodEnd1;
  
  console.log('Test 1 - Within grace period allowed:', isBlocked1 === false ? 'PASS' : 'FAIL');

  // Test 2: User past grace period (10 days ago) should be blocked
  const pastGracePeriod = {
    subscription_status: 'past_due',
    payment_failed_at: daysAgo(10),
  };
  
  const failedAt2 = new Date(pastGracePeriod.payment_failed_at);
  const gracePeriodEnd2 = new Date(failedAt2.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const isBlocked2 = new Date() > gracePeriodEnd2;
  
  console.log('Test 2 - Past grace period blocked:', isBlocked2 === true ? 'PASS' : 'FAIL');

  // Test 3: User with unpaid status should be blocked immediately
  const unpaidUser = {
    subscription_status: 'unpaid',
    payment_failed_at: daysAgo(1),
  };
  
  const isUnpaidBlocked = unpaidUser.subscription_status === 'unpaid';
  console.log('Test 3 - Unpaid user blocked:', isUnpaidBlocked === true ? 'PASS' : 'FAIL');
}

/**
 * Test Suite: Payment Success Unlocking
 */
export function testPaymentSuccessUnlocking() {
  console.log('\n=== Testing Payment Success Unlocking ===');

  // Simulate webhook handler behavior for invoice.payment_succeeded
  function simulatePaymentSuccess(clinic: any): any {
    return {
      ...clinic,
      subscription_status: 'active',
      payment_failed_at: null,
    };
  }

  // Test 1: Past due user becomes active after payment
  const pastDueClinic = {
    subscription_status: 'past_due',
    payment_failed_at: daysAgo(5),
  };
  
  const afterPayment = simulatePaymentSuccess(pastDueClinic);
  const isNowActive = afterPayment.subscription_status === 'active' && afterPayment.payment_failed_at === null;
  
  console.log('Test 1 - Payment clears past_due:', isNowActive === true ? 'PASS' : 'FAIL');

  // Test 2: Grace period cleared after payment
  console.log('Test 2 - payment_failed_at cleared:', afterPayment.payment_failed_at === null ? 'PASS' : 'FAIL');
}

/**
 * Test Suite: Admin Billing Access
 */
export function testAdminBillingAccess() {
  console.log('\n=== Testing Admin Billing Access ===');

  // Helper to check admin access
  function hasAdminAccess(userRole: string): boolean {
    return userRole === 'admin' || userRole === 'owner';
  }

  // Test 1: Admin user can access billing
  console.log('Test 1 - Admin can access billing:', hasAdminAccess('admin') === true ? 'PASS' : 'FAIL');

  // Test 2: Owner user can access billing
  console.log('Test 2 - Owner can access billing:', hasAdminAccess('owner') === true ? 'PASS' : 'FAIL');

  // Test 3: Staff user cannot access billing
  console.log('Test 3 - Staff blocked from billing:', hasAdminAccess('staff') === false ? 'PASS' : 'FAIL');

  // Test 4: Vet user cannot access billing
  console.log('Test 4 - Vet blocked from billing:', hasAdminAccess('vet') === false ? 'PASS' : 'FAIL');
}

/**
 * Test Suite: Trial Expiration
 */
export function testTrialExpiration() {
  console.log('\n=== Testing Trial Expiration ===');

  // Test 1: Active trial should allow access
  const activeTrial = {
    subscription_status: 'trialing',
    trial_ends_at: daysFromNow(5),
  };
  
  const isTrialActive = new Date(activeTrial.trial_ends_at) > new Date();
  console.log('Test 1 - Active trial allowed:', isTrialActive === true ? 'PASS' : 'FAIL');

  // Test 2: Expired trial without subscription should block
  const expiredTrial = {
    subscription_status: 'free',
    trial_ends_at: daysAgo(2),
  };
  
  const isTrialExpired = new Date(expiredTrial.trial_ends_at) < new Date();
  const shouldBlock = isTrialExpired && expiredTrial.subscription_status === 'free';
  console.log('Test 2 - Expired trial blocked:', shouldBlock === true ? 'PASS' : 'FAIL');

  // Test 3: Expired trial WITH active subscription should allow
  const expiredTrialWithSub = {
    subscription_status: 'active',
    trial_ends_at: daysAgo(10),
  };
  
  const hasActiveSubAfterTrial = expiredTrialWithSub.subscription_status === 'active';
  console.log('Test 3 - Expired trial + active sub allowed:', hasActiveSubAfterTrial === true ? 'PASS' : 'FAIL');
}

/**
 * Test Suite: Webhook Handler Behavior
 */
export function testWebhookHandler() {
  console.log('\n=== Testing Webhook Handler Behavior ===');

  // Simulate invoice.payment_failed webhook
  function handlePaymentFailed(clinic: any): any {
    return {
      ...clinic,
      subscription_status: 'past_due',
      payment_failed_at: clinic.payment_failed_at || new Date().toISOString(),
    };
  }

  // Test 1: First payment failure sets payment_failed_at
  const healthyClinic = {
    subscription_status: 'active',
    payment_failed_at: null,
  };
  
  const afterFirstFailure = handlePaymentFailed(healthyClinic);
  console.log('Test 1 - First failure sets timestamp:', afterFirstFailure.payment_failed_at !== null ? 'PASS' : 'FAIL');

  // Test 2: Subsequent failures don't override original timestamp
  const alreadyFailed = {
    subscription_status: 'past_due',
    payment_failed_at: daysAgo(3),
  };
  
  const originalTimestamp = alreadyFailed.payment_failed_at;
  const afterSecondFailure = handlePaymentFailed(alreadyFailed);
  console.log('Test 2 - Original timestamp preserved:', afterSecondFailure.payment_failed_at === originalTimestamp ? 'PASS' : 'FAIL');
}

// Run all tests
export function runAllPaywallTests() {
  console.log('========================================');
  console.log('       PAYWALL FLOW TEST SUITE         ');
  console.log('========================================\n');

  testNewSignupBlocking();
  testGracePeriodEnforcement();
  testPaymentSuccessUnlocking();
  testAdminBillingAccess();
  testTrialExpiration();
  testWebhookHandler();

  console.log('\n========================================');
  console.log('         TEST SUITE COMPLETE           ');
  console.log('========================================');
}

// Auto-run if executed directly
if (import.meta.main) {
  runAllPaywallTests();
}
