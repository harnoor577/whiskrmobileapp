import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle2, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { Footer } from '@/components/layout/Footer';
import { supabase } from '@/integrations/supabase/client';
import whiskrMonogram from '@/assets/whiskr-monogram.png';

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const { updatePassword } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const token_hash = params.get('token_hash');
    const type = params.get('type');
    const email = params.get('email');

    (async () => {
      try {
        if (token_hash && type) {
          // Handle link from email with token_hash
          const { error } = await supabase.auth.verifyOtp({ 
            type: type as any, 
            token_hash 
          });
          if (error) {
            setVerifyError(error.message);
          } else {
            setVerified(true);
          }
        } else if (token && email) {
          // Handle link with token and email
          const { error } = await supabase.auth.verifyOtp({ 
            type: 'recovery', 
            token, 
            email 
          });
          if (error) {
            setVerifyError(error.message);
          } else {
            setVerified(true);
          }
        } else {
          // If no token/email in URL, assume already verified via deep link
          setVerified(true);
        }
      } catch (e: any) {
        setVerifyError(e.message || 'Failed to verify reset link');
      } finally {
        setVerifying(false);
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate inputs
      const validated = resetPasswordSchema.parse({ password, confirmPassword });

      const { error } = await updatePassword(validated.password);

      if (error) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: error.message,
        });
      } else {
        setSuccess(true);
        toast({
          title: 'Password updated',
          description: 'Your password has been successfully changed.',
        });
        // Redirect to login after 2 seconds
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          variant: 'destructive',
          title: 'Validation error',
          description: error.errors[0].message,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fafbfc]">
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white border border-[#e2e8f0] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] relative">
          <Link
            to="/"
            className="absolute top-4 left-4 p-2 rounded-full hover:bg-[#f1f5f9] transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5 text-[#64748b]" />
          </Link>
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              {success ? (
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-r from-[#1ce881] to-[#24ffc9] flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-[#101235]" />
                </div>
              ) : (
                <img 
                  src={whiskrMonogram} 
                  alt="Whiskr" 
                  className="h-14 w-auto"
                />
              )}
            </div>
            <div>
              <CardTitle className="text-2xl text-[#101235]">
                {success ? 'Password changed!' : 'Set new password'}
              </CardTitle>
              <CardDescription className="text-[#64748b]">
                {success 
                  ? "Redirecting you to login..."
                  : "Enter your new password below"
                }
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!success ? (
              verifying ? (
                <div className="text-center py-6">
                  <p className="text-sm text-[#64748b]">Verifying your reset link...</p>
                </div>
              ) : verifyError ? (
                <div className="space-y-4">
                  <p className="text-sm text-red-500">{verifyError}</p>
                  <Button 
                    onClick={() => navigate('/forgot-password')} 
                    className="w-full bg-gradient-to-r from-[#1ce881] to-[#24ffc9] text-[#101235] font-semibold hover:opacity-90 border-0"
                  >
                    Request a new reset link
                  </Button>
                </div>
              ) : !verified ? (
                <div className="text-center py-6">
                  <p className="text-sm text-[#64748b]">Unable to verify link. Please request a new one.</p>
                  <Button 
                    onClick={() => navigate('/forgot-password')} 
                    className="mt-4 bg-gradient-to-r from-[#1ce881] to-[#24ffc9] text-[#101235] font-semibold hover:opacity-90 border-0"
                  >
                    Request new link
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-[#101235]">New Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="pr-10 bg-white border-[#e2e8f0] text-[#101235] placeholder:text-[#94a3b8] focus:border-[#1ce881] focus:ring-[#1ce881]"
                        placeholder="Minimum 8 characters"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-[#64748b]" />
                        ) : (
                          <Eye className="h-4 w-4 text-[#64748b]" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-[#101235]">Confirm Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="pr-10 bg-white border-[#e2e8f0] text-[#101235] placeholder:text-[#94a3b8] focus:border-[#1ce881] focus:ring-[#1ce881]"
                        placeholder="Re-enter your password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4 text-[#64748b]" />
                        ) : (
                          <Eye className="h-4 w-4 text-[#64748b]" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-[#1ce881] to-[#24ffc9] text-[#101235] font-semibold hover:opacity-90 border-0" 
                    disabled={loading}
                  >
                    {loading ? 'Updating...' : 'Update Password'}
                  </Button>
                </form>
              )
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-[#64748b]">
                  You can now sign in with your new password.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
}