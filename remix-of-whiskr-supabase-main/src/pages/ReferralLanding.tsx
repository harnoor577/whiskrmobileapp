import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gift, CheckCircle, Sparkles, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function ReferralLanding() {
  const { code } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Parse inviter name from query parameter
  const params = new URLSearchParams(location.search);
  const rawName = params.get('name');
  const inviterName = rawName 
    ? decodeURIComponent(rawName).replace(/\+/g, ' ').trim() 
    : 'A colleague';
  
  const referralCode = code?.toUpperCase() || '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-4">
      <div className="max-w-4xl mx-auto py-12 space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 rounded-full text-blue-800 font-medium">
            <Gift className="h-4 w-4" />
            Special Invitation
          </div>
          <h1 className="text-5xl font-bold">
            {inviterName} <span className="text-primary">Loves</span> whiskr
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            They've sent you an exclusive extended trial to experience our AI-powered veterinary documentation platform
          </p>
        </div>

        {/* Trial Offer Card */}
        <Card className="border-2 border-primary shadow-2xl">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-4">
              <Sparkles className="h-12 w-12 text-primary animate-pulse" />
            </div>
            <CardTitle className="text-3xl">Extended Trial Offer</CardTitle>
            <CardDescription className="text-lg">
              Get started with more time to explore all features
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-center gap-6 py-6">
              <div className="text-center relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full h-0.5 bg-red-500 rotate-[-15deg]"></div>
                </div>
                <div className="text-4xl font-bold text-muted-foreground/50 line-through">7</div>
                <div className="text-sm text-muted-foreground">Standard Trial</div>
              </div>
              <ArrowRight className="h-8 w-8 text-primary" />
              <div className="text-center">
                <div className="text-6xl font-bold text-primary">14</div>
                <div className="text-sm font-semibold text-primary">Days Extended Trial</div>
              </div>
            </div>

            <div className="space-y-3 py-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">AI-Powered SOAP Notes</p>
                  <p className="text-sm text-muted-foreground">Generate comprehensive clinical records in seconds</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Voice Transcription</p>
                  <p className="text-sm text-muted-foreground">Convert verbal notes to structured documentation</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Smart Clinical Assistant</p>
                  <p className="text-sm text-muted-foreground">Get AI guidance for diagnoses and treatment plans</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Extended Trial Access</p>
                  <p className="text-sm text-muted-foreground">50 consults during your trial period</p>
                </div>
              </div>
            </div>

            <div className="pt-4 space-y-3">
              <Button 
                size="lg" 
                className="w-full text-lg h-14"
                onClick={() => navigate(`/signup?ref=${referralCode}`)}
              >
                Start Your 14-Day Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                No credit card required • Cancel anytime • Full access included
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Trust Indicators */}
        <div className="text-center space-y-2">
          <div className="flex justify-center gap-3 flex-wrap">
            <Badge variant="secondary" className="px-4 py-2">
              HIPAA Compliant
            </Badge>
            <Badge variant="secondary" className="px-4 py-2">
              PIPEDA Compliant
            </Badge>
            <Badge variant="secondary" className="px-4 py-2">
              Trusted by 500+ Clinics
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}