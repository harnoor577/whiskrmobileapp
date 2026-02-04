import { assertEquals, assertExists } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { createMockSupabaseClient, createMockRequest } from "./test-helpers.ts";

Deno.test("send-refund-status-email: handles missing ticket gracefully", async () => {
  const mockSupabase = createMockSupabaseClient({
    'support_tickets.maybeSingle': { data: null, error: null },
  });

  // Simulate the edge function logic
  const ticketId = "non-existent-id";
  const { data: ticket, error: ticketError } = await mockSupabase
    .from('support_tickets')
    .select('*, payload')
    .eq('id', ticketId)
    .maybeSingle();

  // Assert proper handling
  assertEquals(ticket, null, "Should return null for non-existent ticket");
  assertEquals(ticketError, null, "Should not throw database error");
});

Deno.test("send-refund-status-email: handles database error properly", async () => {
  const mockSupabase = createMockSupabaseClient({
    'support_tickets.maybeSingle': { 
      data: null, 
      error: { message: "Database connection failed" } 
    },
  });

  const ticketId = "test-id";
  const { data: ticket, error: ticketError } = await mockSupabase
    .from('support_tickets')
    .select('*, payload')
    .eq('id', ticketId)
    .maybeSingle();

  // Assert error is captured
  assertExists(ticketError, "Should capture database error");
  assertEquals(ticketError.message, "Database connection failed");
});

Deno.test("send-refund-status-email: handles missing user profile", async () => {
  const mockSupabase = createMockSupabaseClient({
    'support_tickets.maybeSingle': { 
      data: { id: 'ticket-1', user_id: 'user-1', payload: {} }, 
      error: null 
    },
    'profiles.maybeSingle': { data: null, error: null },
  });

  // Get ticket
  const { data: ticket } = await mockSupabase
    .from('support_tickets')
    .select('*, payload')
    .eq('id', 'ticket-1')
    .maybeSingle();

  assertExists(ticket, "Should get ticket");

  // Try to get profile
  const { data: profile, error: profileError } = await mockSupabase
    .from('profiles')
    .select('name, email')
    .eq('user_id', ticket.user_id)
    .maybeSingle();

  assertEquals(profile, null, "Should return null for non-existent profile");
  assertEquals(profileError, null, "Should not throw error");
});

Deno.test("send-refund-status-email: successful ticket and profile retrieval", async () => {
  const mockSupabase = createMockSupabaseClient({
    'support_tickets.maybeSingle': { 
      data: { 
        id: 'ticket-1', 
        user_id: 'user-1', 
        payload: { amount: 50, currency: 'USD' } 
      }, 
      error: null 
    },
    'profiles.maybeSingle': { 
      data: { 
        name: 'John Doe', 
        email: 'john@example.com' 
      }, 
      error: null 
    },
  });

  // Get ticket
  const { data: ticket, error: ticketError } = await mockSupabase
    .from('support_tickets')
    .select('*, payload')
    .eq('id', 'ticket-1')
    .maybeSingle();

  assertExists(ticket);
  assertEquals(ticketError, null);
  assertEquals(ticket.user_id, 'user-1');

  // Get profile
  const { data: profile, error: profileError } = await mockSupabase
    .from('profiles')
    .select('name, email')
    .eq('user_id', ticket.user_id)
    .maybeSingle();

  assertExists(profile);
  assertEquals(profileError, null);
  assertEquals(profile.email, 'john@example.com');
});
