import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sanitizeError } from '../_shared/errorHandler.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper functions for VAPID token generation
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

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const pemBody = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  return base64ToArrayBuffer(pemBody);
}

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

function parsePrivateKeyInput(input: string): ArrayBuffer {
  if (input.includes('BEGIN') || input.includes('END')) {
    return pemToArrayBuffer(input);
  }
  if (/^[A-Za-z0-9_-]+$/.test(input)) {
    return base64urlToArrayBuffer(input);
  }
  return base64ToArrayBuffer(input);
}

async function generateVAPIDToken(audience: string, subject: string, vapidPrivateKey: string): Promise<string> {
  const privateKeyBuffer = parsePrivateKeyInput(vapidPrivateKey);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + (12 * 60 * 60),
    sub: subject
  };

  const encodedHeader = arrayBufferToBase64url(new TextEncoder().encode(JSON.stringify(header)).buffer);
  const encodedPayload = arrayBufferToBase64url(new TextEncoder().encode(JSON.stringify(payload)).buffer);
  
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
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
    console.log("[NOTIFY-DIAGNOSTICS] Function started");

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { consultId, clinicId, patientName, diagnosticType } = await req.json();

    console.log('[NOTIFY-DIAGNOSTICS] Params:', { consultId, clinicId, patientName, diagnosticType });

    // Get all profiles in the clinic
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, name')
      .eq('clinic_id', clinicId)
      .eq('status', 'active');

    if (profileError) {
      console.error('[NOTIFY-DIAGNOSTICS] Error fetching profiles:', profileError);
      throw profileError;
    }

    if (!profiles || profiles.length === 0) {
      console.log('[NOTIFY-DIAGNOSTICS] No active users found');
      return new Response(
        JSON.stringify({ message: 'No active users found in clinic' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Get user roles - filter for vets and vet techs (support staff)
    const userIds = profiles.map(p => p.user_id);
    const { data: roles, error: roleError } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', userIds)
      .in('role', ['veterinarian', 'support_staff']);

    if (roleError) {
      console.error('[NOTIFY-DIAGNOSTICS] Error fetching roles:', roleError);
      throw roleError;
    }

    const targetUserIds = roles?.map(r => r.user_id) || [];
    console.log(`[NOTIFY-DIAGNOSTICS] Found ${targetUserIds.length} vets/techs`);

    if (targetUserIds.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No vets or vet techs found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Get push subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', targetUserIds)
      .eq('clinic_id', clinicId);

    if (subError) {
      console.error('[NOTIFY-DIAGNOSTICS] Error fetching subscriptions:', subError);
      throw subError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('[NOTIFY-DIAGNOSTICS] No push subscriptions found');
      return new Response(
        JSON.stringify({ message: 'No push subscriptions found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`[NOTIFY-DIAGNOSTICS] Sending to ${subscriptions.length} subscription(s)`);

    // Send notifications
    const results = await Promise.allSettled(
      subscriptions.map(async (sub, index) => {
        const subscription = sub.subscription as any;
        
        try {
          const endpointUrl = new URL(subscription.endpoint);
          const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
          const vapidToken = await generateVAPIDToken(audience, "mailto:support@ouravet.ai", vapidPrivateKey);
          
          const response = await fetch(subscription.endpoint, {
            method: "POST",
            headers: {
              "TTL": "86400",
              "Authorization": `vapid t=${vapidToken}, k=${vapidPublicKey}`,
            },
          });

          const success = response.status >= 200 && response.status < 300;
          
          if (!success) {
            console.log(`[NOTIFY-DIAGNOSTICS] Error response ${index + 1}:`, response.status);
            // Cleanup expired subscriptions
            if (response.status === 404 || response.status === 410) {
              await supabase.from('push_subscriptions').delete().eq('id', sub.id);
            }
          } else {
            console.log(`[NOTIFY-DIAGNOSTICS] Sent to subscription ${index + 1}`);
          }
          
          return { success, status: response.status };
        } catch (err: any) {
          console.error(`[NOTIFY-DIAGNOSTICS] Error ${index + 1}:`, err?.message);
          return { success: false, error: 'Notification delivery failed' };
        }
      })
    );

    const successCount = results.filter(r => r.status === "fulfilled" && (r as PromiseFulfilledResult<any>).value?.success).length;
    console.log(`[NOTIFY-DIAGNOSTICS] Sent ${successCount}/${subscriptions.length} notifications`);

    return new Response(
      JSON.stringify({ 
        message: 'Notifications sent',
        sent: successCount,
        total: subscriptions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    const sanitized = sanitizeError(error, 'notify-diagnostics-needed');
    return new Response(
      JSON.stringify(sanitized),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});