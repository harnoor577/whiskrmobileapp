import { assertEquals, assertExists } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { createMockSupabaseClient } from "./test-helpers.ts";

Deno.test("database: maybeSingle returns null for missing record", async () => {
  const mockSupabase = createMockSupabaseClient({
    'users.maybeSingle': { data: null, error: null },
  });

  const { data, error } = await mockSupabase
    .from('users')
    .select('*')
    .eq('id', 'non-existent')
    .maybeSingle();

  assertEquals(data, null);
  assertEquals(error, null);
});

Deno.test("database: maybeSingle handles database errors", async () => {
  const mockSupabase = createMockSupabaseClient({
    'users.maybeSingle': { 
      data: null, 
      error: { message: "Connection timeout" } 
    },
  });

  const { data, error } = await mockSupabase
    .from('users')
    .select('*')
    .eq('id', 'some-id')
    .maybeSingle();

  assertEquals(data, null);
  assertExists(error);
  assertEquals(error.message, "Connection timeout");
});

Deno.test("database: successful query returns data", async () => {
  const mockSupabase = createMockSupabaseClient({
    'profiles.maybeSingle': { 
      data: { 
        user_id: 'user-123', 
        clinic_id: 'clinic-456',
        name: 'Test User' 
      }, 
      error: null 
    },
  });

  const { data: profile, error } = await mockSupabase
    .from('profiles')
    .select('*')
    .eq('user_id', 'user-123')
    .maybeSingle();

  assertExists(profile);
  assertEquals(error, null);
  assertEquals(profile.user_id, 'user-123');
  assertEquals(profile.clinic_id, 'clinic-456');
});

Deno.test("database: handles missing foreign key gracefully", async () => {
  const mockSupabase = createMockSupabaseClient({
    'support_tickets.maybeSingle': { 
      data: { id: 'ticket-1', user_id: 'user-1' }, 
      error: null 
    },
    'profiles.maybeSingle': { data: null, error: null },
  });

  // Get ticket
  const { data: ticket } = await mockSupabase
    .from('support_tickets')
    .select('*')
    .eq('id', 'ticket-1')
    .maybeSingle();

  assertExists(ticket);

  // Try to get related profile
  const { data: profile } = await mockSupabase
    .from('profiles')
    .select('email')
    .eq('user_id', ticket.user_id)
    .maybeSingle();

  assertEquals(profile, null, "Should handle missing foreign key relation");
});

Deno.test("database: validates required fields exist", async () => {
  const mockSupabase = createMockSupabaseClient({
    'support_tickets.maybeSingle': { 
      data: { 
        id: 'ticket-1', 
        category: 'billing_refund',
        payload: { amount: 50 } 
      }, 
      error: null 
    },
  });

  const { data: ticket } = await mockSupabase
    .from('support_tickets')
    .select('*, payload')
    .eq('id', 'ticket-1')
    .maybeSingle();

  assertExists(ticket);
  assertEquals(ticket.category, 'billing_refund');
  assertExists(ticket.payload);
  assertEquals(ticket.payload.amount, 50);
});

Deno.test("database: handles missing JSON fields safely", async () => {
  const mockSupabase = createMockSupabaseClient({
    'support_tickets.maybeSingle': { 
      data: { 
        id: 'ticket-1', 
        payload: {} 
      }, 
      error: null 
    },
  });

  const { data: ticket } = await mockSupabase
    .from('support_tickets')
    .select('*, payload')
    .eq('id', 'ticket-1')
    .maybeSingle();

  assertExists(ticket);
  
  // Access nested JSON safely
  const invoiceId = ticket.payload?.invoice;
  assertEquals(invoiceId, undefined, "Should handle missing JSON field");
});

Deno.test("database: update operations handle missing records", async () => {
  const mockSupabase = createMockSupabaseClient({
    'support_tickets.update': { data: null, error: null },
  });

  const result = mockSupabase
    .from('support_tickets')
    .update({ status: 'resolved' });
    
  const { data, error } = await result.eq('id', 'non-existent');

  // Update doesn't fail on missing records, just updates 0 rows
  assertEquals(error, null);
});
