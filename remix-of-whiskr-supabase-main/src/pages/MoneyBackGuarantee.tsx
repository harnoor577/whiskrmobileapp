import { Footer } from '@/components/layout/Footer';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function MoneyBackGuarantee() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="container mx-auto px-4 py-12 max-w-4xl flex-grow">
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-primary hover:text-primary-hover mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <h1 className="text-4xl font-bold mb-6">Money-Back Guarantee</h1>
        
        <div className="prose prose-lg max-w-none">
          <p className="text-lg text-muted-foreground mb-8">
            We stand behind our product with a simple, no-questions-asked guarantee.
          </p>

          <div className="bg-card p-8 rounded-lg shadow-md border border-border">
            <h2 className="text-2xl font-semibold mb-4">Our 30-Day Promise</h2>
            
            <p className="mb-4">
              If you're not satisfied within <strong>30 days</strong> of your first payment, contact our support team and we'll issue a full refund—no questions asked.
            </p>

            <h3 className="text-xl font-semibold mt-6 mb-3">What's Covered</h3>
            <ul className="space-y-2 mb-6">
              <li>✓ First-time purchases on Basic or Professional plans</li>
              <li>✓ Subscriptions made directly through our website</li>
              <li>✓ Full refund of your first month's payment</li>
              <li>✓ No questions asked within the 30-day window</li>
            </ul>

            <h3 className="text-xl font-semibold mt-6 mb-3">How to Request a Refund</h3>
            <ol className="space-y-2 mb-6">
              <li>1. Contact our support team at <a href="mailto:support@whiskr.ai" className="text-primary hover:underline">support@whiskr.ai</a></li>
              <li>2. Include your account email and subscription details</li>
              <li>3. We'll process your refund within 5-7 business days</li>
            </ol>

            <h3 className="text-xl font-semibold mt-6 mb-3">After 30 Days</h3>
            <p>
              After the 30-day guarantee period, normal cancellation terms apply. You can cancel your subscription at any time, and you won't be charged for the following month. However, refunds are not available for previous billing periods beyond the initial 30 days.
            </p>
          </div>

          <div className="mt-8 p-6 bg-accent/10 rounded-lg border border-accent/20">
            <p className="text-sm text-muted-foreground">
              <strong>Questions?</strong> Our team is here to help. Reach out to us at{' '}
              <a href="mailto:support@whiskr.ai" className="text-primary hover:underline">
                support@whiskr.ai
              </a>{' '}
              or visit our <Link to="/support" className="text-primary hover:underline">support page</Link>.
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
