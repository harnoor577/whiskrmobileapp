import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sanitizeError } from '../_shared/errorHandler.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Convert base64url to ArrayBuffer
function base64urlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64WithPadding = base64 + padding;
  const binaryString = atob(base64WithPadding);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Convert standard base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Convert PEM (-----BEGIN PRIVATE KEY-----) to ArrayBuffer
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const pemBody = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  return base64ToArrayBuffer(pemBody);
}

// Convert ArrayBuffer to base64url
function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Accept PEM, base64, or base64url private key formats
function parsePrivateKeyInput(input: string): ArrayBuffer {
  if (input.includes('BEGIN') || input.includes('END')) {
    // PEM
    return pemToArrayBuffer(input);
  }
  if (/^[A-Za-z0-9_-]+$/.test(input)) {
    // Likely base64url
    return base64urlToArrayBuffer(input);
  }
  // Fallback: treat as base64
  return base64ToArrayBuffer(input);
}

// Generate VAPID JWT token
async function generateVAPIDToken(audience: string, subject: string, vapidPrivateKey: string): Promise<string> {
  // Import the private key (supports PEM, base64, or base64url)
  const privateKeyBuffer = parsePrivateKeyInput(vapidPrivateKey);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false,
    ['sign']
  );

  // Create JWT header and payload
  const header = {
    typ: 'JWT',
    alg: 'ES256'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + (12 * 60 * 60), // 12 hours
    sub: subject
  };

  // Encode header and payload
  const encodedHeader = arrayBufferToBase64url(new TextEncoder().encode(JSON.stringify(header)).buffer);
  const encodedPayload = arrayBufferToBase64url(new TextEncoder().encode(JSON.stringify(payload)).buffer);
  
  // Sign the token
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: 'SHA-256',
    },
    cryptoKey,
    new TextEncoder().encode(dataToSign)
  );

  const encodedSignature = arrayBufferToBase64url(signature);
  return `${dataToSign}.${encodedSignature}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[SEND-TEST-NOTIFICATION] Function started");

    // Get authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { 
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false }
      }
    );

    // Get authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("User not authenticated");
    }

    console.log("[SEND-TEST-NOTIFICATION] User authenticated:", user.id);

    // Get user's push subscriptions
    const { data: subscriptions, error: subError } = await supabaseClient
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user.id);

    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      console.log("[SEND-TEST-NOTIFICATION] No subscriptions found for user");
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "No push subscriptions found. Please enable notifications first." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`[SEND-TEST-NOTIFICATION] Found ${subscriptions.length} subscription(s)`);

    // Get VAPID keys
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error("VAPID keys not configured");
    }

    // For maximum compatibility, send a payload-less Web Push "ping".
    // The service worker will show a default notification when data is absent.
    // This avoids payload encryption requirements across push services.

    console.log("[SEND-TEST-NOTIFICATION] Sending notification with VAPID auth");

    // Send to all user's subscriptions
    const results = await Promise.allSettled(
      subscriptions.map(async (sub, index) => {
        const subscription = sub.subscription as any;
        console.log(`[SEND-TEST-NOTIFICATION] Sending to subscription ${index + 1}:`, subscription.endpoint?.slice(0, 50));
        
        try {
          // Parse endpoint URL for audience
          const endpointUrl = new URL(subscription.endpoint);
          const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
          
          // Generate VAPID JWT token
          const vapidToken = await generateVAPIDToken(audience, "mailto:support@ouravet.ai", vapidPrivateKey);
          
          const response = await fetch(subscription.endpoint, {
            method: "POST",
            headers: {
              // Do NOT set Content-Type for web push
              "TTL": "86400",
              "Authorization": `vapid t=${vapidToken}, k=${vapidPublicKey}`,
            },
          });

          console.log(`[SEND-TEST-NOTIFICATION] Response for subscription ${index + 1}:`, response.status, response.statusText);
          
          const success = response.status >= 200 && response.status < 300;
          
          if (!success) {
            const responseText = await response.text();
            console.log(`[SEND-TEST-NOTIFICATION] Error response body for subscription ${index + 1}:`, responseText);
            // Cleanup expired/invalid subscriptions
            if (response.status === 404 || response.status === 410) {
              console.log(`[SEND-TEST-NOTIFICATION] Deleting expired subscription ${sub.id}`);
              await supabaseClient.from('push_subscriptions').delete().eq('id', sub.id);
            }
          }
          
          return { success, status: response.status, statusText: response.statusText };
        } catch (err: any) {
          console.error(`[SEND-TEST-NOTIFICATION] Error sending to subscription ${index + 1}:`, err?.message || err);
          return { success: false, error: err?.message || "Unknown error" };
        }
      })
    );

    const successCount = results.filter(r => r.status === "fulfilled" && (r as PromiseFulfilledResult<any>).value?.success).length;
    const totalCount = subscriptions.length;

    console.log(`[SEND-TEST-NOTIFICATION] Final results: ${successCount}/${totalCount} successful`);

    return new Response(
      JSON.stringify({ 
        success: successCount > 0, 
        message: successCount > 0 
          ? `Test notification sent successfully to ${successCount} device(s)!` 
          : `Unable to send notification. This usually means your browser's push subscription has expired. Please disable and re-enable notifications to refresh the connection.`,
        total: totalCount,
        successCount,
        helpText: successCount === 0 ? "Try: 1) Click 'Disable', 2) Refresh page, 3) Enable notifications again" : undefined
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    const sanitized = sanitizeError(error, 'send-test-notification');
    return new Response(
      JSON.stringify({ 
        success: false, 
        ...sanitized,
        message: "Failed to send test notification."
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});