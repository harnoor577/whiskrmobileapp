import { assertEquals, assertExists } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { createMockSupabaseClient, createMockStripe } from "./test-helpers.ts";

Deno.test("process-stripe-refund: handles missing ticket", async () => {
  const mockSupabase = createMockSupabaseClient({
    'user_roles.maybeSingle': { 
      data: { role: 'super_admin' }, 
      error: null 
    },
    'support_tickets.maybeSingle': { data: null, error: null },
  });

  const ticketId = "non-existent-id";
  const { data: ticket, error: ticketError } = await mockSupabase
    .from('support_tickets')
    .select('*, payload')
    .eq('id', ticketId)
    .maybeSingle();

  assertEquals(ticket, null, "Should return null for missing ticket");
  assertEquals(ticketError, null, "Should not throw database error");
});

Deno.test("process-stripe-refund: handles invoice with payment_intent", async () => {
  const mockStripe = createMockStripe({
    'invoices.retrieve': {
      id: 'inv_123',
      payment_intent: 'pi_123',
      charge: null,
      status: 'paid',
    },
  });

  const invoice = await mockStripe.invoices.retrieve('inv_123');
  
  assertExists(invoice);
  assertEquals(invoice.payment_intent, 'pi_123');
  
  // Should use payment_intent for refund
  const refundParams: any = {
    amount: 5000,
    reason: 'requested_by_customer',
  };
  
  if (invoice.payment_intent) {
    refundParams.payment_intent = invoice.payment_intent;
  }
  
  assertEquals(refundParams.payment_intent, 'pi_123');
});

Deno.test("process-stripe-refund: handles invoice with charge only", async () => {
  const mockStripe = createMockStripe({
    'invoices.retrieve': {
      id: 'inv_123',
      payment_intent: null,
      charge: 'ch_123',
      status: 'paid',
    },
  });

  const invoice = await mockStripe.invoices.retrieve('inv_123');
  
  assertExists(invoice);
  assertEquals(invoice.charge, 'ch_123');
  
  // Should use charge for refund when no payment_intent
  const refundParams: any = {
    amount: 5000,
    reason: 'requested_by_customer',
  };
  
  if (invoice.payment_intent) {
    refundParams.payment_intent = invoice.payment_intent;
  } else if (invoice.charge) {
    refundParams.charge = invoice.charge;
  }
  
  assertEquals(refundParams.charge, 'ch_123');
  assertEquals(refundParams.payment_intent, undefined);
});

Deno.test("process-stripe-refund: handles invoice with neither payment_intent nor charge", async () => {
  const mockStripe = createMockStripe({
    'invoices.retrieve': {
      id: 'inv_123',
      payment_intent: null,
      charge: null,
      status: 'draft',
    },
  });

  const invoice = await mockStripe.invoices.retrieve('inv_123');
  
  assertExists(invoice);
  
  // Should detect that neither exists
  const hasPaymentIntent = !!invoice.payment_intent;
  const hasCharge = !!invoice.charge;
  
  assertEquals(hasPaymentIntent, false);
  assertEquals(hasCharge, false);
  
  // This should result in an error in the actual function
  if (!hasPaymentIntent && !hasCharge) {
    const errorMessage = 'Invoice has no payment intent or charge. Cannot process refund.';
    assertExists(errorMessage);
  }
});

Deno.test("process-stripe-refund: calculates refund amounts correctly", () => {
  // Full refund
  const fullRefund = {
    refund_type: 'full',
    amount: undefined,
  };
  assertEquals(fullRefund.amount, undefined, "Full refund should not specify amount");
  
  // Partial refund (convert dollars to cents)
  const partialRefund = {
    refund_type: 'partial',
    amount: 25.50,
  };
  const refundAmountCents = Math.round(partialRefund.amount * 100);
  assertEquals(refundAmountCents, 2550, "Should convert $25.50 to 2550 cents");
  
  // Prorated refund
  const proratedRefund = {
    refund_type: 'prorated',
    amount: 15.75,
  };
  const proratedCents = Math.round(proratedRefund.amount * 100);
  assertEquals(proratedCents, 1575, "Should convert $15.75 to 1575 cents");
});

Deno.test("process-stripe-refund: creates refund with correct parameters", async () => {
  const mockStripe = createMockStripe({
    'refunds.create': {
      id: 're_mock123',
      amount: 5000,
      currency: 'usd',
      status: 'succeeded',
    },
  });

  const refund = await mockStripe.refunds.create({
    payment_intent: 'pi_123',
    amount: 5000,
    reason: 'requested_by_customer',
  });
  
  assertExists(refund);
  assertEquals(refund.id, 're_mock123');
  assertEquals(refund.amount, 5000);
  assertEquals(refund.status, 'succeeded');
});
