import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import whiskrMonogram from "@/assets/whiskr-monogram.png";
import { z } from "zod";
import { Footer } from "@/components/layout/Footer";
import { OTPVerificationDialog } from "@/components/auth/OTPVerificationDialog";
import { ClinicSelector } from "@/components/auth/ClinicSelector";
import { DeviceLimitDialog } from "@/components/auth/DeviceLimitDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";
import { getDeviceFingerprint, getDeviceName, getClientIP } from "@/lib/deviceFingerprint";
import { storeTrustedDevice } from "@/lib/trustedDevice";
import { Checkbox } from "@/components/ui/checkbox";
import { getOAuthRedirectUrl } from "@/lib/oauthHelper";

const loginSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(255, "Email too long"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showOTPDialog, setShowOTPDialog] = useState(false);
  const [showClinicSelector, setShowClinicSelector] = useState(false);
  const [showDeviceLimitDialog, setShowDeviceLimitDialog] = useState(false);
  const [availableClinics, setAvailableClinics] = useState<Array<{ id: string; name: string }>>([]);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [rememberMe, setRememberMe] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null);
  const [deviceFingerprint, setDeviceFingerprint] = useState<string>("");
  const [deviceName, setDeviceName] = useState<string>("");
  const [ipAddress, setIpAddress] = useState<string>("");
  const { signIn, selectClinic, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [authLoading, user, navigate]);

  // Initialize device fingerprint on mount
  useEffect(() => {
    const initDevice = async () => {
      try {
        console.log("[LOGIN] Initializing device info...");
        const [fp, ip] = await Promise.all([getDeviceFingerprint(), getClientIP()]);
        const name = getDeviceName();

        console.log("[LOGIN] Device info loaded:", {
          fingerprint: fp?.substring(0, 10) + "...",
          ip,
          name,
          userAgent: navigator.userAgent,
        });

        setDeviceFingerprint(fp);
        setIpAddress(ip);
        setDeviceName(name);
      } catch (error) {
        console.error("[LOGIN] Error initializing device:", error);
      }
    };
    initDevice();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate inputs
      const validated = loginSchema.parse({ email, password });

      // Check if this user requires MFA via backend
      const { data: requiresMFA } = await supabase.rpc("check_requires_mfa", {
        p_email: validated.email,
      });

      if (requiresMFA) {
        // SECURITY: Verify credentials BEFORE sending OTP
        const { data: credentialsData, error: credentialsError } = await supabase.functions.invoke(
          "verify-credentials",
          {
            body: {
              email: validated.email,
              password: validated.password,
            },
          },
        );

        // Handle rate limiting from verify-credentials
        if (credentialsError?.status === 429) {
          const retryAfter = credentialsData?.retryAfter;
          const retryDate = retryAfter ? new Date(retryAfter) : null;
          const waitMinutes = retryDate ? Math.ceil((retryDate.getTime() - Date.now()) / 60000) : 15;

          toast({
            variant: "destructive",
            title: "Too many attempts",
            description: `Please wait ${waitMinutes} minutes before trying again.`,
          });
          setLoading(false);
          return;
        }

        // Handle account lockout
        if (credentialsError?.status === 423) {
          const lockedUntil = credentialsData?.lockedUntil;
          const lockDate = lockedUntil ? new Date(lockedUntil) : null;
          const waitTime = lockDate ? Math.ceil((lockDate.getTime() - Date.now()) / 60000) : 30;

          toast({
            variant: "destructive",
            title: "Account locked",
            description: `Your account is temporarily locked. Please wait ${waitTime} minutes.`,
          });
          setLoading(false);
          return;
        }

        // Check if credentials are valid
        if (credentialsError || !credentialsData?.valid) {
          toast({
            variant: "destructive",
            title: "Login failed",
            description: "Invalid email or password",
          });
          setLoading(false);
          return;
        }

        // Credentials verified - NOW send the OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        const { error: otpError } = await supabase.functions.invoke("send-auth-otp", {
          body: {
            email: validated.email,
            otp,
            isTest: false,
          },
        });

        if (otpError) {
          if (otpError.status === 429) {
            toast({
              variant: "destructive",
              title: "Too many requests",
              description: "Please wait a few minutes before trying again.",
            });
          } else {
            toast({
              variant: "destructive",
              title: "Failed to send verification code",
              description: "Please try again or use the forgot password link below.",
            });
          }
          setLoading(false);
          return;
        }

        // Store credentials and show OTP dialog
        setPendingCredentials({ email: validated.email, password: validated.password });
        setShowOTPDialog(true);
        sonnerToast.success("Verification code sent to your email");
      } else {
        // Regular login for non-super admin users
        // Only pass device info if it's loaded
        const deviceInfoToSend = deviceFingerprint
          ? {
              deviceFingerprint,
              ipAddress,
              userAgent: navigator.userAgent,
              deviceName,
              rememberMe,
            }
          : undefined;

        console.log("[LOGIN] Attempting sign in with device info:", {
          hasDeviceInfo: !!deviceInfoToSend,
          deviceName: deviceInfoToSend?.deviceName,
          fingerprintLength: deviceInfoToSend?.deviceFingerprint?.length,
        });

        const { error, data } = await signIn(validated.email, validated.password, deviceInfoToSend);

        console.log("[LOGIN] Sign in completed:", {
          hasError: !!error,
          errorMessage: error?.message,
          requiresClinicSelection: data?.requiresClinicSelection,
        });

        if (data?.requiresClinicSelection) {
          // User has multiple clinics, show selector
          setAvailableClinics(data.clinics);
          setPendingCredentials({ email: validated.email, password: validated.password });
          setShowClinicSelector(true);
        } else if (error) {
          // Check if it's a device limit error
          if (error.message?.includes("Device limit reached")) {
            // Show device management dialog instead of just an error
            setShowDeviceLimitDialog(true);
          } else {
            toast({
              variant: "destructive",
              title: "Login failed",
              description: error.message,
            });
          }
        } else {
          if (rememberDevice && deviceFingerprint) {
            // Store trusted device with 30-day expiration
            storeTrustedDevice(deviceFingerprint);
          }
          sonnerToast.success("Login successful! Redirecting...");
          setTimeout(() => navigate("/dashboard"), 500);
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          variant: "destructive",
          title: "Validation error",
          description: error.errors[0].message,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: error instanceof Error ? error.message : "An error occurred",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (otp: string): Promise<boolean> => {
    if (!pendingCredentials) return false;

    try {
      // Verify OTP
      const { data, error } = await supabase.functions.invoke("verify-master-admin", {
        body: {
          email: pendingCredentials.email,
          otp,
        },
      });

      // Handle rate limiting
      if (error?.status === 429) {
        const body = error.context?.body;
        const retryAfter = body?.retryAfter;
        const retryDate = retryAfter ? new Date(retryAfter) : null;
        const waitMinutes = retryDate ? Math.ceil((retryDate.getTime() - Date.now()) / 60000) : 15;

        toast({
          variant: "destructive",
          title: "Too many attempts",
          description: `Please wait ${waitMinutes} minutes before trying again.`,
        });
        return false;
      }

      // Handle account lockout
      if (error?.status === 423) {
        const body = error.context?.body;
        const lockedUntil = body?.lockedUntil;
        const lockDate = lockedUntil ? new Date(lockedUntil) : null;
        const waitTime = lockDate ? Math.ceil((lockDate.getTime() - Date.now()) / 60000) : 15;

        toast({
          variant: "destructive",
          title: "Account locked",
          description: body?.error || `Your account is temporarily locked. Please wait ${waitTime} minutes.`,
        });
        return false;
      }

      if (error || !data?.valid) {
        if (error?.status !== 429 && error?.status !== 423) {
          toast({
            variant: "destructive",
            title: "Invalid code",
            description: "The code you entered is incorrect or has expired.",
          });
        }
        return false;
      }

      // OTP verified, proceed with login
      const deviceInfoToSend = deviceFingerprint
        ? {
            deviceFingerprint,
            ipAddress,
            userAgent: navigator.userAgent,
            deviceName,
          }
        : undefined;

      const { error: signInError } = await signIn(
        pendingCredentials.email,
        pendingCredentials.password,
        deviceInfoToSend,
      );

      if (signInError) {
        toast({
          variant: "destructive",
          title: "Login failed",
          description: signInError.message,
        });
        return false;
      }

      setShowOTPDialog(false);
      setPendingCredentials(null);

      // Store trusted device with 30-day expiration
      if (rememberDevice && deviceFingerprint) {
        storeTrustedDevice(deviceFingerprint);
      }

      sonnerToast.success("Login successful! Redirecting...");
      setTimeout(() => navigate("/dashboard"), 500);
      return true;
    } catch (error) {
      console.error("Error verifying OTP:", error);
      return false;
    }
  };

  const handleVerifyBackupCode = async (backupCode: string): Promise<boolean> => {
    if (!pendingCredentials) return false;

    try {
      // Verify backup code
      const { data, error } = await supabase.functions.invoke("verify-master-admin", {
        body: {
          email: pendingCredentials.email,
          backupCode,
        },
      });

      // Handle rate limiting
      if (error?.status === 429) {
        const body = error.context?.body;
        const retryAfter = body?.retryAfter;
        const retryDate = retryAfter ? new Date(retryAfter) : null;
        const waitMinutes = retryDate ? Math.ceil((retryDate.getTime() - Date.now()) / 60000) : 15;

        toast({
          variant: "destructive",
          title: "Too many attempts",
          description: `Please wait ${waitMinutes} minutes before trying again.`,
        });
        return false;
      }

      // Handle account lockout
      if (error?.status === 423) {
        const body = error.context?.body;
        const lockedUntil = body?.lockedUntil;
        const lockDate = lockedUntil ? new Date(lockedUntil) : null;
        const waitTime = lockDate ? Math.ceil((lockDate.getTime() - Date.now()) / 60000) : 15;

        toast({
          variant: "destructive",
          title: "Account locked",
          description: body?.error || `Your account is temporarily locked. Please wait ${waitTime} minutes.`,
        });
        return false;
      }

      if (error || !data?.valid) {
        if (error?.status !== 429 && error?.status !== 423) {
          toast({
            variant: "destructive",
            title: "Invalid backup code",
            description: "The backup code you entered is incorrect or has already been used.",
          });
        }
        return false;
      }

      // Backup code verified, proceed with login
      const deviceInfoToSend = deviceFingerprint
        ? {
            deviceFingerprint,
            ipAddress,
            userAgent: navigator.userAgent,
            deviceName,
          }
        : undefined;

      const { error: signInError } = await signIn(
        pendingCredentials.email,
        pendingCredentials.password,
        deviceInfoToSend,
      );

      if (signInError) {
        toast({
          variant: "destructive",
          title: "Login failed",
          description: signInError.message,
        });
        return false;
      }

      setShowOTPDialog(false);
      setPendingCredentials(null);

      // Store trusted device with 30-day expiration
      if (rememberDevice && deviceFingerprint) {
        storeTrustedDevice(deviceFingerprint);
      }

      sonnerToast.warning("Backup code used. Please generate new backup codes in Account Settings.");
      sonnerToast.success("Login successful! Redirecting...");
      setTimeout(() => navigate("/dashboard"), 500);
      return true;
    } catch (error) {
      console.error("Error verifying backup code:", error);
      return false;
    }
  };

  // Show loading state while auth is initializing or redirecting
  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#fafbfc]">
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white border border-[#e2e8f0] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)]">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1ce881]"></div>
                <p className="text-[#64748b]">Loading...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

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
              <Link to="/" className="hover:opacity-80 transition-opacity">
                <img src={whiskrMonogram} alt="whiskr" className="h-14 w-auto" />
              </Link>
            </div>
            <div>
              <CardTitle className="text-2xl text-[#101235]">Welcome to whiskr</CardTitle>
              <CardDescription className="text-[#64748b]">Sign in to your veterinary clinical copilot</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
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
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[#101235]">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10 bg-white border-[#e2e8f0] text-[#101235] placeholder:text-[#94a3b8] focus:border-[#1ce881] focus:ring-[#1ce881]"
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
                <div className="flex items-center justify-end">
                  <Link to="/forgot-password" className="text-sm text-[#1ce881] hover:text-[#0d9488] hover:underline">
                    Forgot password?
                  </Link>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rememberDevice"
                  checked={rememberDevice}
                  onCheckedChange={(checked) => setRememberDevice(checked as boolean)}
                  className="border-[#e2e8f0] data-[state=checked]:bg-[#1ce881] data-[state=checked]:border-[#1ce881]"
                />
                <label
                  htmlFor="rememberDevice"
                  className="text-sm font-medium leading-none text-[#101235] cursor-pointer"
                >
                  Remember this device
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rememberMe"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                  className="border-[#e2e8f0] data-[state=checked]:bg-[#1ce881] data-[state=checked]:border-[#1ce881]"
                />
                <label
                  htmlFor="rememberMe"
                  className="text-sm font-medium leading-none text-[#101235] cursor-pointer"
                >
                  Remember me for 30 days
                </label>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-[#1ce881] to-[#24ffc9] text-[#101235] font-semibold hover:opacity-90 border-0" 
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-[#e2e8f0]" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-[#64748b]">Or continue with</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full bg-[#101235] text-white border-[#101235] hover:bg-[#1a1d4a] hover:text-white"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    const { error } = await supabase.auth.signInWithOAuth({
                      provider: "google",
                      options: {
                        redirectTo: getOAuthRedirectUrl(),
                      },
                    });
                    if (error) {
                      toast({
                        variant: "destructive",
                        title: "Google sign-in failed",
                        description: error.message,
                      });
                    }
                  } catch (error) {
                    toast({
                      variant: "destructive",
                      title: "Error",
                      description: "Failed to initiate Google sign-in",
                    });
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Continue with Google
              </Button>

              {/* Sign Up Link - Removed */}
            </form>
          </CardContent>
        </Card>
      </div>
      <Footer />

      <OTPVerificationDialog
        open={showOTPDialog}
        onVerify={handleVerifyOTP}
        onUseBackupCode={handleVerifyBackupCode}
        email={pendingCredentials?.email || ""}
      />

      <ClinicSelector
        open={showClinicSelector}
        clinics={availableClinics}
        onSelect={async (clinicId) => {
          await selectClinic(clinicId);
          setShowClinicSelector(false);
          setPendingCredentials(null);
          sonnerToast.success("Clinic selected successfully! Redirecting...");
          setTimeout(() => navigate("/dashboard"), 500);
        }}
      />

      <DeviceLimitDialog
        open={showDeviceLimitDialog}
        email={email}
        onDeviceRevoked={() => {
          // Retry login after device is revoked
          setShowDeviceLimitDialog(false);
          handleSubmit(new Event("submit") as any);
        }}
        onCancel={() => {
          setShowDeviceLimitDialog(false);
          setLoading(false);
        }}
      />
    </div>
  );
}
