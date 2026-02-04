import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Mail, CheckCircle, XCircle } from 'lucide-react';

export default function TestOTP() {
  const [testEmail, setTestEmail] = useState('bbal@growdvm.com');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const sendTestOTP = async () => {
    if (!testEmail) {
      toast.error('Please enter an email address');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      // Generate a test OTP
      const testOTP = Math.floor(100000 + Math.random() * 900000).toString();

      const { data, error } = await supabase.functions.invoke('send-auth-otp', {
        body: {
          email: testEmail,
          otp: testOTP,
          isTest: true,
        },
      });

      if (error) throw error;

      setResult({
        success: true,
        message: `Test email sent successfully to ${testEmail}! Check your inbox. Test OTP was: ${testOTP}`,
      });
      toast.success('Test email sent!');
    } catch (error: any) {
      console.error('Error sending test OTP:', error);
      setResult({
        success: false,
        message: error.message || 'Failed to send test email',
      });
      toast.error('Failed to send test email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <Mail className="h-6 w-6 text-primary" />
            <CardTitle>Test OTP Email System</CardTitle>
          </div>
          <CardDescription>
            Send a test OTP email to verify the email delivery system is working
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Test Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter email address"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <Button
            onClick={sendTestOTP}
            disabled={loading || !testEmail}
            className="w-full"
          >
            {loading ? 'Sending...' : 'Send Test OTP Email'}
          </Button>

          {result && (
            <Alert variant={result.success ? 'default' : 'destructive'}>
              {result.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          )}

          <div className="pt-4 border-t space-y-2">
            <p className="text-sm text-muted-foreground">
              <strong>What happens:</strong>
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>A test OTP email will be sent to the specified address</li>
              <li>The email will be marked as [TEST] in the subject</li>
              <li>You'll see the OTP code on this page for verification</li>
              <li>Check your spam folder if you don't see it</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
