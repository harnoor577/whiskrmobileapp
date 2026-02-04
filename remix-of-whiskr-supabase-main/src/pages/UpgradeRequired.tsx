import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, ArrowRight, Check } from 'lucide-react';
import { SUBSCRIPTION_TIERS } from '@/lib/subscriptionTiers';

export default function UpgradeRequired() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-subtle">
      <Card className="w-full max-w-4xl shadow-elegant">
        <CardHeader className="text-center space-y-4 pb-4">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center animate-in zoom-in duration-500">
              <Lock className="h-12 w-12 text-primary" />
            </div>
          </div>
          <div>
            <CardTitle className="text-3xl mb-2">Subscription Required</CardTitle>
            <CardDescription className="text-base">
              Choose a plan to access Whiskr and unlock powerful veterinary tools
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-8">
          {/* Plan Cards */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Basic Plan */}
            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <CardTitle>
                  {SUBSCRIPTION_TIERS.basic.name}
                </CardTitle>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold">${SUBSCRIPTION_TIERS.basic.monthly_amount}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {SUBSCRIPTION_TIERS.basic.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild className="w-full" size="lg">
                  <Link to="/billing">
                    Choose Basic
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Professional Plan */}
            <Card className="border-2 border-primary hover:shadow-lg transition-all relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-semibold">
                  Most Popular
                </span>
              </div>
              <CardHeader>
                <CardTitle>
                  {SUBSCRIPTION_TIERS.professional.name}
                </CardTitle>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold">${SUBSCRIPTION_TIERS.professional.monthly_amount}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {SUBSCRIPTION_TIERS.professional.features.map((feature, idx) => {
                    const isComingSoon = SUBSCRIPTION_TIERS.professional.comingSoon.some(
                      (item) => feature.includes(item)
                    );
                    return (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm">
                          {feature}
                          {isComingSoon && (
                            <span className="ml-2 text-xs text-muted-foreground">(Coming soon)</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <Button asChild className="w-full" size="lg">
                  <Link to="/billing">
                    Choose Professional
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Enterprise Option */}
          <div className="text-center p-6 bg-muted/50 rounded-lg">
            <h3 className="font-semibold text-lg mb-2">Need More?</h3>
            <p className="text-muted-foreground mb-4">
              Enterprise plans with unlimited users, devices, and consults are available
            </p>
            <Button asChild variant="outline" size="lg">
              <Link to="/billing">
                View Enterprise Options
              </Link>
            </Button>
          </div>

          {/* Support Note */}
          <div className="text-center pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Questions?{' '}
              <Link to="/support" className="text-primary hover:underline font-medium">
                Contact our team
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
