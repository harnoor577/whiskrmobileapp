// Web Push Notifications Service
import { supabase } from '@/integrations/supabase/client';

export const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export const inIframe = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

export const checkPushSupport = (): boolean => {
  // Push requires secure context (https) and supported APIs
  return (
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
};

export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!checkPushSupport()) {
    throw new Error('Push notifications are not supported in this browser');
  }
  if (inIframe()) {
    throw new Error('Notifications permission cannot be requested inside this preview. Open the app in a new tab to enable.');
  }
  // Check current permission state
  const currentPermission = Notification.permission;
  console.log('[Push] Current permission state:', currentPermission);
  
  if (currentPermission === 'denied') {
    throw new Error('Notification permission was previously denied. Please enable in browser settings.');
  }
  
  // Always request permission explicitly to ensure Chrome updates its UI
  // This is safe to call even if already granted
  console.log('[Push] Requesting notification permission...');
  const permission = await Notification.requestPermission();
  console.log('[Push] Permission result:', permission);
  
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted');
  }
  
  return permission;
};

export const subscribeToPush = async (userId: string, clinicId: string): Promise<PushSubscription | null> => {
  try {
    if (!checkPushSupport()) {
      throw new Error('Push notifications not supported');
    }

    const permission = await requestNotificationPermission();
    
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return null;
    }

    // Register service worker
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // Subscribe to push notifications
    // VAPID public key - read from env (must be configured)
    let vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
    if (!vapidPublicKey || vapidPublicKey.includes('YOUR_VAPID_PUBLIC_KEY_HERE')) {
      // Fallback: fetch from backend (public function)
      try {
        const { data, error } = await supabase.functions.invoke('get-vapid-public-key');
        if (!error && data?.key) {
          vapidPublicKey = data.key as string;
        }
      } catch (e) {
        // noop
      }
    }

    if (!vapidPublicKey) {
      console.warn('VAPID public key is not configured. Permission may be granted but device will not receive pushes until configured.');
      return null; // don't throw: still allows permission prompt to show
    }
    
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });

    // Send subscription to backend
    const { error: fnError } = await supabase.functions.invoke('save-push-subscription', {
      body: {
        subscription,
        userId,
        clinicId,
      },
    });

    if (fnError) {
      throw fnError;
    }

    console.log('Push notification subscription successful');
    return subscription;
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    return null;
  }
};

export const unsubscribeFromPush = async (): Promise<boolean> => {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      await subscription.unsubscribe();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    return false;
  }
};

export const getPushSubscriptionStatus = async (): Promise<{
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
}> => {
  const supported = checkPushSupport();
  
  // In preview iframe environments, treat as not enabled to avoid false positives
  if (inIframe()) {
    return {
      supported,
      permission: 'default',
      subscribed: false,
    };
  }

  if (!supported) {
    return {
      supported: false,
      permission: 'denied',
      subscribed: false,
    };
  }

  const permission = Notification.permission;
  let subscribed = false;

  try {
    // Check if service worker is already registered
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (registration) {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // Only consider "subscribed" if this endpoint is saved for the current user
        try {
          const endpoint = (subscription as any).endpoint as string;
          const { data, error } = await supabase
            .from('push_subscriptions')
            .select('id')
            .eq('subscription->>endpoint', endpoint)
            .limit(1);

          if (error) throw error;
          subscribed = !!(data && data.length > 0);
        } catch (dbErr) {
          console.error('Error verifying subscription ownership:', dbErr);
          subscribed = false;
        }
      }
    }
  } catch (error) {
    console.error('Error checking subscription status:', error);
  }

  return {
    supported,
    permission,
    subscribed,
  };
};
