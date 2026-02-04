import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bell, BellOff, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import {
  checkPushSupport,
  subscribeToPush,
  unsubscribeFromPush,
  getPushSubscriptionStatus,
} from '@/lib/pushNotifications';
import { toast } from 'sonner';

export function PushNotificationPrompt() {
  const { user, clinicId } = useAuth();
  const [status, setStatus] = useState({
    supported: false,
    permission: 'default' as NotificationPermission,
    subscribed: false,
  });
  const [loading, setLoading] = useState(false);
const [showPrompt, setShowPrompt] = useState(false);

const isVapidConfigured = Boolean(import.meta.env.VITE_VAPID_PUBLIC_KEY) && !(import.meta.env.VITE_VAPID_PUBLIC_KEY as string).includes('YOUR_VAPID_PUBLIC_KEY_HERE');
const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    // Auto-open prompt on first visit per device if permission is 'default'
    const dismissed = localStorage.getItem('pushPromptDismissed') === '1';
    if (status.supported && status.permission === 'default' && !dismissed) {
      setShowPrompt(true);
      // Attach one-time click handler to satisfy user-gesture requirement
      const handler = () => {
        handleEnableNotifications();
        window.removeEventListener('click', handler, { once: true } as any);
      };
      window.addEventListener('click', handler, { once: true } as any);
      return () => window.removeEventListener('click', handler as any);
    }
  }, [status.supported, status.permission]);
  const checkStatus = async () => {
    const currentStatus = await getPushSubscriptionStatus();
    setStatus(currentStatus);
  };

  const handleEnableNotifications = async () => {
    if (!user || !clinicId) {
      toast.error('Please log in to enable notifications');
      return;
    }

    setLoading(true);
    try {
      console.log('[Enable] Starting notification enable flow...');
      const subscription = await subscribeToPush(user.id, clinicId);
      console.log('[Enable] Subscribe result:', subscription);
      
      // Wait a bit for the database to update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Recheck permission state
      const finalPermission = Notification.permission;
      
      if (finalPermission === 'granted') {
        if (subscription) {
          toast.success("Notifications enabled! You'll receive case updates.");
          localStorage.setItem('pushPromptDismissed', '1');
          setShowPrompt(false);
        } else {
          toast.info('Permission granted. Please check your browser settings if notifications don\'t appear.');
        }
        await checkStatus();
      } else if (finalPermission === 'denied') {
        toast.error('Permission denied. Please enable notifications in your browser settings.');
      } else {
        toast.error('Permission was not granted. Please try again.');
      }
    } catch (error: any) {
      console.error('[Enable] Error enabling notifications:', error);
      toast.error(error.message || 'Could not enable notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleDisableNotifications = async () => {
    setLoading(true);
    try {
      const success = await unsubscribeFromPush();
      if (success) {
        toast.success('Push notifications disabled');
        localStorage.removeItem('pushPromptDismissed');
        await checkStatus();
      }
    } catch (error) {
      console.error('Error disabling notifications:', error);
      toast.error('Could not disable notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleTestNotification = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-test-notification');
      
      if (error) throw error;
      
      if (data.success) {
        toast.success(data.message || 'Test notification sent!');
      } else {
        toast.error(data.message || 'Failed to send test notification', {
          description: data.helpText,
          duration: 8000,
        });
      }
    } catch (error: any) {
      console.error('Error sending test notification:', error);
      toast.error('Failed to send test notification');
    } finally {
      setLoading(false);
    }
  };

  if (!status.supported) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Push notifications are not supported in your browser. Try using Chrome, Firefox, or Edge.
        </AlertDescription>
      </Alert>
    );
  }

  if (status.permission === 'denied') {
    return (
      <Alert variant="destructive" className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BellOff className="h-4 w-4" />
          <AlertDescription>
            Notifications are blocked. Please enable them in your browser settings to receive case updates.
          </AlertDescription>
        </div>
        <Button size="sm" variant="outline" onClick={checkStatus}>
          Recheck
        </Button>
      </Alert>
    );
  }

  if (status.subscribed && status.permission === 'granted') {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-900">Notifications Enabled</p>
                <p className="text-sm text-green-700">You'll receive updates about case changes</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisableNotifications}
              disabled={loading}
              className="flex-shrink-0"
            >
              <BellOff className="h-4 w-4 mr-2" />
              Disable
            </Button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTestNotification}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
            ) : (
              <><Bell className="h-4 w-4 mr-2" /> Send Test Notification</>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-blue-700" />
          Stay Updated with Push Notifications
        </CardTitle>
        <CardDescription className="text-blue-900">
          Enable notifications to receive instant updates about:
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isInIframe && (
          <Alert>
            <AlertDescription>
              Notification prompts are blocked in this preview. Open the app in a new tab to enable notifications.
            </AlertDescription>
          </Alert>
        )}
        {!isVapidConfigured && (
          <Alert>
            <AlertDescription>
              Notifications are not fully configured for this clinic. An admin must add the VAPID public key. You can still grant permission now.
            </AlertDescription>
          </Alert>
        )}
        <ul className="space-y-2 text-sm text-blue-900">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600" />
            <span><strong>Case Updates:</strong> When patient records or consult notes are modified</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600" />
            <span><strong>SOAP Completion:</strong> When AI generates or completes SOAP notes</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600" />
            <span><strong>Task Reminders:</strong> When tasks are assigned or due dates approach</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600" />
            <span><strong>Team Messages:</strong> When colleagues need your attention or approval</span>
          </li>
        </ul>
        <Button
          onClick={handleEnableNotifications}
          disabled={loading || isInIframe}
          className="w-full"
          size="lg"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Requesting Permission...</>
          ) : (
            <><Bell className="h-4 w-4 mr-2" /> Enable Notifications</>
          )}
        </Button>
        <p className="text-xs text-blue-700 text-center">
          {isInIframe ? 'Open the app in a new tab to enable notifications' : 'You can change this setting anytime in your browser preferences'}
        </p>
      </CardContent>
    </Card>
  );
}
