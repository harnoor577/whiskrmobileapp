import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Monitor, Smartphone, Laptop, Trash2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface DeviceSession {
  id: string;
  device_name: string;
  device_fingerprint: string;
  last_active_at: string;
  created_at: string;
  ip_address: string;
  user_agent: string;
}

interface DeviceLimitDialogProps {
  open: boolean;
  email: string;
  onDeviceRevoked: () => void;
  onCancel: () => void;
}

export function DeviceLimitDialog({ open, email, onDeviceRevoked, onCancel }: DeviceLimitDialogProps) {
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    if (open && email) {
      fetchDevices();
    }
  }, [open, email]);

  const fetchDevices = async () => {
    setLoading(true);
    
    // Get user ID from email
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (!profile) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('device_sessions')
      .select('*')
      .eq('user_id', profile.id)
      .eq('revoked', false)
      .gte('last_active_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('last_active_at', { ascending: false });

    if (!error && data) {
      setDevices(data);
    }
    setLoading(false);
  };

  const handleRevokeDevice = async (deviceId: string) => {
    setRevoking(deviceId);
    
    const { error } = await supabase
      .from('device_sessions')
      .update({ 
        revoked: true, 
        revoked_at: new Date().toISOString()
      })
      .eq('id', deviceId);

    if (error) {
      toast.error('Failed to revoke device');
      setRevoking(null);
    } else {
      toast.success('Device revoked successfully. You can now log in.');
      setRevoking(null);
      // Notify parent that device was revoked so it can retry login
      onDeviceRevoked();
    }
  };

  const getDeviceIcon = (deviceName: string) => {
    const name = deviceName.toLowerCase();
    if (name.includes('iphone') || name.includes('phone') || name.includes('android')) {
      return <Smartphone className="h-4 w-4" />;
    } else if (name.includes('ipad') || name.includes('tablet')) {
      return <Laptop className="h-4 w-4" />;
    }
    return <Monitor className="h-4 w-4" />;
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Device Limit Reached
          </DialogTitle>
          <DialogDescription>
            Your credentials are correct, but you've reached the maximum number of devices for your plan.
            Please remove a device to continue.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <Monitor className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Active devices in the last 7 days
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : devices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No active devices found
            </p>
          ) : (
            devices.map((device) => (
              <div
                key={device.id}
                className="flex items-start justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex items-start gap-3 flex-1">
                  <div className="mt-1">
                    {getDeviceIcon(device.device_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{device.device_name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Last active: {format(new Date(device.last_active_at), 'MMM d, h:mm a')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      IP: {device.ip_address}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevokeDevice(device.id)}
                  disabled={revoking === device.id}
                >
                  {revoking === device.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-destructive" />
                  )}
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
