import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { Footer } from '@/components/layout/Footer';
import whiskrMonogram from '@/assets/whiskr-monogram.png';

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(255, 'Email too long'),
});

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { resetPassword } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate input
      const validated = forgotPasswordSchema.parse({ email });

      const { error } = await resetPassword(validated.email);

      if (error) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: error.message,
        });
      } else {
        setSubmitted(true);
        toast({
          title: 'Email sent',
          description: 'If an account exists with this email, you will receive a password reset link.',
        });
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
        <Card className="w-full max-w-md bg-white border border-[#e2e8f0] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)]">
          <CardHeader className="text-center space-y-4">
            <Link
              to="/"
              className="absolute top-4 left-4 p-2 rounded-full hover:bg-[#f1f5f9] transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5 text-[#64748b]" />
            </Link>
            <div className="flex justify-center">
              <img 
                src={whiskrMonogram} 
                alt="Whiskr" 
                className="h-14 w-auto"
              />
            </div>
            <div>
              <CardTitle className="text-2xl text-[#101235]">Reset your password</CardTitle>
              <CardDescription className="text-[#64748b]">
                {submitted 
                  ? "Check your email for a reset link"
                  : "Enter your email address and we'll send you a reset link"
                }
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!submitted ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[#101235]">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="veterinarian@clinic.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-white border-[#e2e8f0] text-[#101235] placeholder:text-[#94a3b8] focus:border-[#1ce881] focus:ring-[#1ce881]"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-[#1ce881] to-[#24ffc9] text-[#101235] font-semibold hover:opacity-90 border-0" 
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>
                <div className="text-center">
                  <Link 
                    to="/login" 
                    className="text-sm text-[#64748b] hover:text-[#1ce881] inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to login
                  </Link>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <p className="text-sm text-[#64748b]">
                    If an account exists with <strong className="text-[#101235]">{email}</strong>, you will receive a password reset link shortly.
                  </p>
                  <p className="text-sm text-[#64748b]">
                    Please check your inbox and spam folder.
                  </p>
                </div>
                <Link to="/login">
                  <Button variant="outline" className="w-full border-[#e2e8f0] text-[#101235] hover:bg-[#f1f5f9]">
                    Return to login
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
}