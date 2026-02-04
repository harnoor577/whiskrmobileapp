import { LegalPageLayout } from "@/components/layout/LegalPageLayout";
import { Link } from "react-router-dom";

export default function RefundPolicy() {
  return (
    <LegalPageLayout title="Refund Policy" lastUpdated="January 29, 2026">
      <h2>30-Day Money-Back Guarantee</h2>
      <p>
        We offer a 30-day money-back guarantee for all new customers on our Basic and Professional plans. If you're not
        completely satisfied with whiskr within your first 30 days, we'll refund your payment in full—no questions
        asked.
      </p>

      <h2>Eligibility Requirements</h2>
      <ul>
        <li>Refund requests must be made within 30 days of your initial subscription payment</li>
        <li>Applies only to first-time customers and first-time subscriptions</li>
        <li>Valid for Basic and Professional plans purchased directly through our website</li>
        <li>Enterprise plans and custom contracts may have different terms (see your agreement)</li>
      </ul>

      <h2>How to Request a Refund</h2>
      <ol>
        <li>
          <strong>Contact Support:</strong> Email us at <a href="mailto:support@whiskr.ai">support@whiskr.ai</a> with
          "Refund Request" in the subject line
        </li>
        <li>
          <strong>Provide Details:</strong> Include your account email address and subscription details
        </li>
        <li>
          <strong>Processing:</strong> We'll confirm your request and process the refund within 5-7 business days
        </li>
        <li>
          <strong>Receive Funds:</strong> The refund will appear in your account within 7-10 business days, depending on
          your payment provider
        </li>
      </ol>

      <h2>Cancellation Policy</h2>
      <p>
        You can cancel your subscription at any time through your account settings or by contacting support. Upon
        cancellation:
      </p>
      <ul>
        <li>You'll retain access until the end of your current billing period</li>
        <li>No further charges will be made after the current period ends</li>
        <li>Refunds are not provided for partial months after the 30-day guarantee period</li>
        <li>Your data will be retained for 90 days after cancellation, then permanently deleted</li>
      </ul>

      <h2>Exceptions & Special Cases</h2>
      <ul>
        <li>Violations of our Terms of Service may result in forfeiture of refund eligibility</li>
        <li>Fraudulent chargebacks may result in permanent account suspension</li>
        <li>Enterprise custom contracts follow the terms outlined in the signed agreement</li>
        <li>Add-on services may have separate refund terms</li>
      </ul>

      <h2>Contact Information</h2>
      <p>For refund requests or questions about our refund policy:</p>
      <div className="company-info">
        <p className="mb-0">
          <strong>Email:</strong> <a href="mailto:support@whiskr.ai">support@whiskr.ai</a>
          <br />
          <strong>Subject Line:</strong> "Refund Request" or "Refund Policy Question"
          <br />
          <strong>Response Time:</strong> We aim to respond within 24 business hours
        </p>
      </div>

      <p className="mt-8 pt-6 border-t border-[#e2e8f0] text-sm">
        This refund policy is part of our <Link to="/terms">Terms & Conditions</Link>. By subscribing to whiskr, you
        agree to these terms. We reserve the right to update this policy with notice to active subscribers.
      </p>
    </LegalPageLayout>
  );
}
