import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Monitor, Smartphone, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { LoginHistorySkeleton } from '@/components/settings/LoginHistorySkeleton';
import { useToast } from '@/hooks/use-toast';

interface LoginAttempt {
  id: string;
  login_time: string;
  device_name: string | null;
  ip_address: string | null;
  success: boolean;
  failure_reason: string | null;
}

export default function LoginHistory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loginHistory, setLoginHistory] = useState<LoginAttempt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchLoginHistory();
    }
  }, [user]);

  const fetchLoginHistory = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('login_history')
        .select('id, login_time, device_name, ip_address, success, failure_reason')
        .eq('user_id', user?.id)
        .order('login_time', { ascending: false })
        .limit(50);

      if (error) throw error;

      setLoginHistory(data || []);
    } catch (error) {
      console.error('Error fetching login history:', error);
      toast({
        title: 'Error',
        description: 'Failed to load login history',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getDeviceIcon = (deviceName: string | null) => {
    if (!deviceName) return <Monitor className="h-4 w-4" />;
    const lower = deviceName.toLowerCase();
    if (lower.includes('mobile') || lower.includes('android') || lower.includes('iphone')) {
      return <Smartphone className="h-4 w-4" />;
    }
    return <Monitor className="h-4 w-4" />;
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Login History</CardTitle>
          <CardDescription>
            Review your recent login attempts and device information for security monitoring
          </CardDescription>
        </CardHeader>
        <CardContent>
            {isLoading ? (
              <LoginHistorySkeleton />
            ) : loginHistory.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No login history available
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loginHistory.map((attempt) => (
                      <TableRow key={attempt.id}>
                        <TableCell>
                          {attempt.success ? (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Success
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="h-3 w-3" />
                              Failed
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {format(new Date(attempt.login_time), 'PPp')}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(attempt.login_time), 'zzz')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getDeviceIcon(attempt.device_name)}
                            <span>{attempt.device_name || 'Unknown Device'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {attempt.ip_address || 'N/A'}
                          </code>
                        </TableCell>
                        <TableCell>
                          {!attempt.success && attempt.failure_reason && (
                            <span className="text-sm text-destructive">
                              {attempt.failure_reason}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
