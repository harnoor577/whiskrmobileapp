import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isDespia, isIOS } from "@/lib/despia";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check for error in URL params first
        const urlParams = new URLSearchParams(window.location.search);
        const error = urlParams.get("error");
        const errorDescription = urlParams.get("error_description");

        if (error) {
          setStatus("error");
          setErrorMessage(errorDescription || error);
          return;
        }

        // Get the session - Supabase will automatically exchange the tokens
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("Auth callback error:", sessionError);
          setStatus("error");
          setErrorMessage(sessionError.message);
          return;
        }

        if (data.session) {
          // Check if this is a new OAuth user who needs to complete onboarding
          const isNewOAuthUser = await checkIfNewOAuthUser(data.session.user.id);
          
          if (isNewOAuthUser) {
            // Extract info from Google provider
            const googleName = data.session.user.user_metadata?.full_name || 
                               data.session.user.user_metadata?.name || '';
            
            const params = new URLSearchParams({
              oauth: 'true',
              name: googleName,
              email: data.session.user.email || ''
            });
            
            // Preserve referral code if present
            const existingRef = urlParams.get('ref');
            if (existingRef) {
              params.set('ref', existingRef);
            }
            
            navigate(`/signup?${params.toString()}`, { replace: true });
            return;
          }
          
          setStatus("success");

          // iOS Despia: Trigger deep-link return to native app
          if (isDespia() && isIOS()) {
            // Small delay to show success state
            setTimeout(() => {
              // Try to return to native app via deep link
              window.location.href = "whiskr://auth-success";
            }, 500);
          }

          // Redirect to dashboard after short delay to show success
          setTimeout(() => {
            navigate("/dashboard", { replace: true });
          }, 1000);
        } else {
          // No session found, might need to wait for hash parsing
          // Supabase SDK handles hash fragment automatically on page load
          // Let's wait a moment and try again
          setTimeout(async () => {
            const { data: retryData, error: retryError } = await supabase.auth.getSession();
            
            if (retryError || !retryData.session) {
              setStatus("error");
              setErrorMessage(retryError?.message || "Authentication failed. Please try again.");
              return;
            }

            // Check if this is a new OAuth user who needs to complete onboarding
            const isNewOAuthUser = await checkIfNewOAuthUser(retryData.session.user.id);
            
            if (isNewOAuthUser) {
              const googleName = retryData.session.user.user_metadata?.full_name || 
                                 retryData.session.user.user_metadata?.name || '';
              
              const params = new URLSearchParams({
                oauth: 'true',
                name: googleName,
                email: retryData.session.user.email || ''
              });
              
              navigate(`/signup?${params.toString()}`, { replace: true });
              return;
            }

            setStatus("success");
            
            if (isDespia() && isIOS()) {
              setTimeout(() => {
                window.location.href = "whiskr://auth-success";
              }, 500);
            }

            setTimeout(() => {
              navigate("/dashboard", { replace: true });
            }, 1000);
          }, 1000);
        }
      } catch (err) {
        console.error("Auth callback exception:", err);
        setStatus("error");
        setErrorMessage("An unexpected error occurred during authentication.");
      }
    };

    handleCallback();
  }, [navigate]);

  // Check if user is a new OAuth signup (no user_type set, created recently)
  async function checkIfNewOAuthUser(userId: string): Promise<boolean> {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('user_type, created_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !profile) {
        console.error('Error checking profile:', error);
        return false;
      }

      // If user_type is already set, they've completed onboarding
      if (profile.user_type) {
        return false;
      }

      // Check if profile was created within last 5 minutes (new signup)
      const createdAt = new Date(profile.created_at);
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      
      return createdAt.getTime() > fiveMinutesAgo;
    } catch (err) {
      console.error('Error in checkIfNewOAuthUser:', err);
      return false;
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            {status === "loading" && (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Signing you in...
              </>
            )}
            {status === "success" && (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                Success!
              </>
            )}
            {status === "error" && (
              <>
                <XCircle className="h-5 w-5 text-destructive" />
                Authentication Failed
              </>
            )}
          </CardTitle>
          <CardDescription>
            {status === "loading" && "Please wait while we complete your sign-in..."}
            {status === "success" && "Redirecting you to the dashboard..."}
            {status === "error" && errorMessage}
          </CardDescription>
        </CardHeader>
        {status === "error" && (
          <CardContent className="flex flex-col gap-3">
            <Button onClick={() => navigate("/login")} className="w-full">
              Back to Login
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()} className="w-full">
              Try Again
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}