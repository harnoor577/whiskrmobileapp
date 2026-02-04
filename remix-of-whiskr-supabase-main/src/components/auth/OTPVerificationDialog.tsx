import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface OTPVerificationDialogProps {
  open: boolean;
  onVerify: (otp: string) => Promise<boolean>;
  onUseBackupCode: (code: string) => Promise<boolean>;
  email: string;
}

export function OTPVerificationDialog({ open, onVerify, onUseBackupCode, email }: OTPVerificationDialogProps) {
  const [otp, setOtp] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBackupInput, setShowBackupInput] = useState(false);

  const handleVerifyOTP = async () => {
    if (!otp.trim()) {
      toast.error('Please enter the verification code');
      return;
    }

    setLoading(true);
    try {
      const success = await onVerify(otp.trim());
      if (!success) {
        toast.error('Invalid verification code. Please try again.');
        setOtp('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyBackup = async () => {
    if (!backupCode.trim()) {
      toast.error('Please enter a backup code');
      return;
    }

    setLoading(true);
    try {
      const success = await onUseBackupCode(backupCode.trim());
      if (!success) {
        toast.error('Invalid backup code. Please try again.');
        setBackupCode('');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-full bg-blue-100">
              <Shield className="h-5 w-5 text-blue-600" />
            </div>
            <DialogTitle>Master Admin Verification</DialogTitle>
          </div>
          <DialogDescription>
            A verification code has been sent to <strong>{email}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!showBackupInput ? (
            <>
              <Alert>
                <AlertDescription className="text-sm">
                  Check your email for a 6-digit verification code. The code expires in 10 minutes.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="otp">Verification Code</Label>
                <Input
                  id="otp"
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  className="text-center text-2xl tracking-widest"
                  autoComplete="off"
                  disabled={loading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && otp.length === 6) {
                      handleVerifyOTP();
                    }
                  }}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleVerifyOTP}
                  disabled={loading || otp.length !== 6}
                  className="flex-1"
                >
                  {loading ? 'Verifying...' : 'Verify'}
                </Button>
              </div>

              <div className="pt-4 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowBackupInput(true)}
                  className="w-full text-sm"
                >
                  Use backup code instead
                </Button>
              </div>
            </>
          ) : (
            <>
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Emergency Access:</strong> Backup codes are for emergency use only. Each code can only be used once.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="backup">Backup Code</Label>
                <Input
                  id="backup"
                  type="text"
                  placeholder="Enter backup code"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                  className="font-mono"
                  autoComplete="off"
                  disabled={loading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && backupCode.trim()) {
                      handleVerifyBackup();
                    }
                  }}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowBackupInput(false);
                    setBackupCode('');
                  }}
                  disabled={loading}
                >
                  Back
                </Button>
                <Button
                  onClick={handleVerifyBackup}
                  disabled={loading || !backupCode.trim()}
                  className="flex-1"
                >
                  {loading ? 'Verifying...' : 'Use Backup Code'}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
