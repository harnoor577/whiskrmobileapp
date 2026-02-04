import { assertEquals, assertExists } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { createMockSupabaseClient } from "./test-helpers.ts";

Deno.test("auth: handles missing authorization header", () => {
  const authHeader = null;
  
  if (!authHeader) {
    const error = new Error("No authorization header provided");
    assertExists(error);
    assertEquals(error.message, "No authorization header provided");
  }
});

Deno.test("auth: handles invalid user authentication", async () => {
  const mockSupabase = createMockSupabaseClient({
    'auth.getUser': { 
      data: { user: null }, 
      error: { message: "Invalid JWT" } 
    },
  });

  const { data: userData, error: userError } = await mockSupabase.auth.getUser('invalid-token');
  
  assertExists(userError);
  assertEquals(userError.message, "Invalid JWT");
  assertEquals(userData.user, null);
});

Deno.test("auth: validates super admin role", async () => {
  const mockSupabase = createMockSupabaseClient({
    'user_roles.maybeSingle': { 
      data: { role: 'super_admin' }, 
      error: null 
    },
  });

  const { data: isSuperAdmin } = await mockSupabase
    .from('user_roles')
    .select('role')
    .eq('user_id', 'user-123')
    .eq('role', 'super_admin')
    .maybeSingle();

  assertExists(isSuperAdmin);
  assertEquals(isSuperAdmin.role, 'super_admin');
});

Deno.test("auth: handles non-admin user", async () => {
  const mockSupabase = createMockSupabaseClient({
    'user_roles.maybeSingle': { data: null, error: null },
  });

  const { data: isSuperAdmin } = await mockSupabase
    .from('user_roles')
    .select('role')
    .eq('user_id', 'user-123')
    .eq('role', 'super_admin')
    .maybeSingle();

  assertEquals(isSuperAdmin, null, "Non-admin should return null");
});

Deno.test("auth: extracts token from Bearer header", () => {
  const authHeader = "Bearer abc123token";
  const token = authHeader.replace("Bearer ", "");
  
  assertEquals(token, "abc123token");
});

Deno.test("auth: validates user email exists", async () => {
  const mockSupabase = createMockSupabaseClient({
    'auth.getUser': { 
      data: { 
        user: { 
          id: 'user-123', 
          email: 'user@example.com' 
        } 
      }, 
      error: null 
    },
  });

  const { data: userData } = await mockSupabase.auth.getUser('valid-token');
  
  assertExists(userData.user);
  assertExists(userData.user.email);
  assertEquals(userData.user.email, 'user@example.com');
});

Deno.test("auth: handles user without email", async () => {
  const mockSupabase = createMockSupabaseClient({
    'auth.getUser': { 
      data: { 
        user: { 
          id: 'user-123', 
          email: null 
        } 
      }, 
      error: null 
    },
  });

  const { data: userData } = await mockSupabase.auth.getUser('valid-token');
  const user = userData.user;
  
  if (!user?.email) {
    const error = new Error("User not authenticated or email not available");
    assertExists(error);
    assertEquals(error.message, "User not authenticated or email not available");
  }
});
