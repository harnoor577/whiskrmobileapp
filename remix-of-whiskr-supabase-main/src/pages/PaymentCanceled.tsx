import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle, ArrowLeft, Mail } from "lucide-react";

const PaymentCanceled = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Payment Canceled</CardTitle>
          <CardDescription>
            Your payment was canceled and no charges were made.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            You can try again or contact our support team if you're experiencing issues.
          </p>
          
          <div className="space-y-2">
            <Button 
              onClick={() => navigate("/choose-plan")} 
              className="w-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Try Again
            </Button>
            
            <Button 
              onClick={() => navigate("/support")} 
              variant="outline"
              className="w-full"
            >
              <Mail className="mr-2 h-4 w-4" />
              Contact Support
            </Button>
          </div>

          <div className="text-center pt-4">
            <Button 
              onClick={() => navigate("/login")} 
              variant="link"
              className="text-sm"
            >
              Return to Login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentCanceled;
