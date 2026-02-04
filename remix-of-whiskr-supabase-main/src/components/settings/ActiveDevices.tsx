import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Loader2, Monitor, Smartphone, Laptop, Trash2, 
  Chrome, Globe, Apple, RefreshCw, Shield, Wifi
} from 'lucide-react';
import { formatDistanceToNow, differenceInMinutes } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getCachedData, AccountSettingsCacheData } from '@/hooks/use-prefetch';

interface DeviceSession {
  id: string;
  device_name: string;
  device_fingerprint: string;
  last_active_at: string;
  created_at: string;
  ip_address: string;
  user_agent: string;
  revoked: boolean;
}

interface ParsedDevice {
  browser: string;
  os: string;
  deviceType: 'phone' | 'tablet' | 'desktop';
}

// Parse device name into browser and OS
function parseDeviceName(deviceName: string): ParsedDevice {
  const name = deviceName.toLowerCase();
  
  // Detect browser
  let browser = 'Browser';
  if (name.includes('chrome')) browser = 'Chrome';
  else if (name.includes('safari')) browser = 'Safari';
  else if (name.includes('firefox')) browser = 'Firefox';
  else if (name.includes('edge')) browser = 'Edge';
  else if (name.includes('opera')) browser = 'Opera';
  else if (name.includes('brave')) browser = 'Brave';
  
  // Detect OS
  let os = 'Unknown';
  if (name.includes('windows')) os = 'Windows';
  else if (name.includes('macos') || name.includes('mac os')) os = 'macOS';
  else if (name.includes('ios') || name.includes('iphone') || name.includes('ipad')) os = 'iOS';
  else if (name.includes('android')) os = 'Android';
  else if (name.includes('linux')) os = 'Linux';
  
  // Detect device type
  let deviceType: 'phone' | 'tablet' | 'desktop' = 'desktop';
  if (name.includes('iphone') || name.includes('phone') || name.includes('android')) {
    deviceType = 'phone';
  } else if (name.includes('ipad') || name.includes('tablet')) {
    deviceType = 'tablet';
  }
  
  return { browser, os, deviceType };
}

// Format relative time with "Active now" for recent activity
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const minutesAgo = differenceInMinutes(new Date(), date);
  
  if (minutesAgo < 2) return 'Active now';
  if (minutesAgo < 60) return `${minutesAgo} minutes ago`;
  
  return formatDistanceToNow(date, { addSuffix: true });
}

export function ActiveDevices() {
  const { user, clinicId } = useAuth();
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [maxDevices, setMaxDevices] = useState<number>(3);
  const [subscriptionTier, setSubscriptionTier] = useState<string>('basic');
  const [deviceToRevoke, setDeviceToRevoke] = useState<DeviceSession | null>(null);
  const [showRevokeAllDialog, setShowRevokeAllDialog] = useState(false);

  useEffect(() => {
    if (user && clinicId) {
      // Check if data was prefetched
      const cached = getCachedData<AccountSettingsCacheData>(`account-settings-${user.id}`);
      if (cached?.devices && cached.devices.length > 0) {
        setDevices(cached.devices);
        if (cached.clinic) {
          setMaxDevices(cached.clinic.max_devices || 3);
          setSubscriptionTier(cached.clinic.subscription_tier || 'basic');
        }
        setLoading(false);
        return;
      }
      fetchDevices();
      fetchClinicInfo();
    }
  }, [user, clinicId]);

  const fetchClinicInfo = async () => {
    if (!clinicId) return;
    
    const { data, error } = await supabase
      .from('clinics')
      .select('max_devices, subscription_tier')
      .eq('id', clinicId)
      .single();

    if (!error && data) {
      setMaxDevices(data.max_devices || 3);
      setSubscriptionTier(data.subscription_tier || 'basic');
    }
  };

  const fetchDevices = async () => {
    if (!user) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from('device_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('revoked', false)
      .gte('last_active_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('last_active_at', { ascending: false });

    if (!error && data) {
      setDevices(data);
    }
    setLoading(false);
  };

  const handleRevokeDevice = async (device: DeviceSession) => {
    setRevoking(device.id);
    setDeviceToRevoke(null);
    
    const { error } = await supabase
      .from('device_sessions')
      .update({ 
        revoked: true, 
        revoked_at: new Date().toISOString(),
        revoked_by: user?.id 
      })
      .eq('id', device.id);

    if (error) {
      toast.error('Failed to revoke device');
    } else {
      toast.success('Device signed out successfully');
      fetchDevices();
    }
    
    setRevoking(null);
  };

  const handleRevokeAllOtherDevices = async () => {
    if (!user) return;
    
    setShowRevokeAllDialog(false);
    setLoading(true);
    
    const { error } = await supabase
      .from('device_sessions')
      .update({ 
        revoked: true, 
        revoked_at: new Date().toISOString(),
        revoked_by: user.id 
      })
      .eq('user_id', user.id)
      .eq('revoked', false)
      .neq('id', devices[0]?.id);

    if (error) {
      toast.error('Failed to revoke devices');
    } else {
      toast.success('All other devices have been signed out');
      fetchDevices();
    }
    
    setLoading(false);
  };

  const getDeviceIcon = (deviceType: 'phone' | 'tablet' | 'desktop') => {
    switch (deviceType) {
      case 'phone':
        return <Smartphone className="h-5 w-5" />;
      case 'tablet':
        return <Laptop className="h-5 w-5" />;
      default:
        return <Monitor className="h-5 w-5" />;
    }
  };

  const getBrowserIcon = (browser: string) => {
    if (browser === 'Safari') return <Apple className="h-3 w-3" />;
    if (browser === 'Chrome') return <Chrome className="h-3 w-3" />;
    return <Globe className="h-3 w-3" />;
  };

  const activeCount = devices.length;
  const isAtLimit = maxDevices !== -1 && activeCount >= maxDevices;
  const tierName = subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Active Devices
              </CardTitle>
              <CardDescription>
                Manage devices with access to your account
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isAtLimit ? 'destructive' : 'secondary'}>
                {maxDevices === -1 ? `${activeCount} devices` : `${activeCount}/${maxDevices}`}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={fetchDevices}
                disabled={loading}
                className="h-8 w-8"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="rounded-full bg-muted p-3 mb-3">
                <Monitor className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No active devices</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your devices will appear here once you sign in
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {devices.map((device, index) => {
                  const isCurrentDevice = index === 0;
                  const parsed = parseDeviceName(device.device_name);
                  const isActiveNow = differenceInMinutes(new Date(), new Date(device.last_active_at)) < 5;
                  
                  return (
                    <div
                      key={device.id}
                      className={`relative flex items-start justify-between p-4 rounded-lg border transition-all ${
                        isCurrentDevice 
                          ? 'border-primary/40 bg-primary/5 shadow-sm' 
                          : 'bg-card hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start gap-3 flex-1">
                        {/* Device Icon with Status Indicator */}
                        <div className="relative">
                          <div className={`p-2 rounded-lg ${isCurrentDevice ? 'bg-primary/10' : 'bg-muted'}`}>
                            {getDeviceIcon(parsed.deviceType)}
                          </div>
                          {isActiveNow && (
                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                            </span>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Primary Info: Device Type + Current Badge */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm">
                              {parsed.os} {parsed.deviceType === 'phone' ? 'Phone' : parsed.deviceType === 'tablet' ? 'Tablet' : 'Desktop'}
                            </p>
                            {isCurrentDevice && (
                              <Badge className="bg-primary/20 text-primary border-0 text-xs">
                                This device
                              </Badge>
                            )}
                          </div>
                          
                          {/* Secondary Info: Browser + Activity */}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              {getBrowserIcon(parsed.browser)}
                              {parsed.browser}
                            </span>
                            <span className="flex items-center gap-1">
                              <Wifi className="h-3 w-3" />
                              {formatRelativeTime(device.last_active_at)}
                            </span>
                          </div>
                          
                          {/* Tertiary Info: IP Address */}
                          <p className="text-xs text-muted-foreground/70">
                            IP: {device.ip_address || 'Unknown'}
                          </p>
                        </div>
                      </div>
                      
                      {/* Revoke Button - Don't show for current device */}
                      {!isCurrentDevice && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeviceToRevoke(device)}
                          disabled={revoking === device.id}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          {revoking === device.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>

              {devices.length > 1 && (
                <Button
                  variant="outline"
                  onClick={() => setShowRevokeAllDialog(true)}
                  disabled={loading}
                  className="w-full"
                >
                  Sign Out All Other Devices
                </Button>
              )}

              {isAtLimit && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-sm font-medium text-destructive mb-1">Device limit reached</p>
                  <p className="text-xs text-muted-foreground">
                    Your {tierName} plan includes {maxDevices} devices. 
                    {subscriptionTier !== 'enterprise' && ' Upgrade to add more devices.'}
                  </p>
                </div>
              )}

              <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                <p>• Devices are automatically removed after 30 days of inactivity</p>
                <p>• Activity is tracked over the last 7 days</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Revoke Single Device Dialog */}
      <AlertDialog open={!!deviceToRevoke} onOpenChange={() => setDeviceToRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out device?</AlertDialogTitle>
            <AlertDialogDescription>
              This will sign out <span className="font-medium text-foreground">{deviceToRevoke?.device_name}</span> and 
              require re-authentication on that device to access your account again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deviceToRevoke && handleRevokeDevice(deviceToRevoke)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sign Out Device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke All Other Devices Dialog */}
      <AlertDialog open={showRevokeAllDialog} onOpenChange={setShowRevokeAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out all other devices?</AlertDialogTitle>
            <AlertDialogDescription>
              This will sign out {devices.length - 1} other device{devices.length - 1 !== 1 ? 's' : ''} and 
              require re-authentication on those devices. Your current device will remain signed in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeAllOtherDevices}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sign Out All Others
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
