import { LegalPageLayout } from "@/components/layout/LegalPageLayout";
import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="January 29, 2026">
      <h2>1. Introduction</h2>
      <p>
        Whiskr Inc ("we," "our," or "us") operates whiskr. This Privacy Policy explains how we collect, use, disclose,
        and safeguard your information when you use our veterinary documentation and AI assistance platform.
      </p>

      <h2>2. Company Information</h2>
      <div className="company-info">
        <strong>Whiskr Inc</strong>
        <p className="mt-2 mb-0">
          A Delaware C Corporation
          <br />
          28 Geary St, STE 650 #5268
          <br />
          San Francisco, CA 94108
          <br />
          Email: <a href="mailto:support@whiskr.ai">support@whiskr.ai</a>
        </p>
      </div>

      <h2>3. Information We Collect</h2>

      <h3>3.1 Personal Information</h3>
      <p>We collect information that you provide directly to us, including:</p>
      <ul>
        <li>Name, email address, phone number</li>
        <li>Clinic information and professional credentials</li>
        <li>Payment and billing information</li>
        <li>Account credentials</li>
      </ul>

      <h3>3.2 Veterinary Data</h3>
      <p>We collect and process:</p>
      <ul>
        <li>Patient records (animal health information)</li>
        <li>Consultation notes and SOAP records</li>
        <li>Voice recordings and transcriptions</li>
        <li>Uploaded documents and images</li>
        <li>Treatment plans and medical notes</li>
      </ul>

      <h3>3.3 Usage Information</h3>
      <ul>
        <li>Device information and IP addresses</li>
        <li>Browser type and operating system</li>
        <li>Usage patterns and feature interactions</li>
        <li>Error logs and performance data</li>
      </ul>

      <h2>4. How We Use Your Information</h2>
      <p>We use the collected information to:</p>
      <ul>
        <li>Provide, maintain, and improve our services</li>
        <li>Process AI-assisted documentation and analysis</li>
        <li>Generate SOAP notes and medical summaries</li>
        <li>Process payments and manage subscriptions</li>
        <li>Send service updates and notifications</li>
        <li>Ensure platform security and prevent fraud</li>
        <li>Comply with legal obligations</li>
        <li>Improve AI models and service quality</li>
      </ul>

      <h2>5. Data Security and HIPAA/PIPEDA Compliance</h2>
      <p>We implement industry-standard security measures including:</p>
      <ul>
        <li>AES-256 encryption at rest and TLS 1.2+ in transit</li>
        <li>Role-based access controls</li>
        <li>Regular security audits and monitoring</li>
        <li>Secure data centers with redundancy</li>
        <li>Data residency options (US/Canada)</li>
      </ul>
      <p>
        While we handle veterinary medical records, we acknowledge that animal health information may not be subject to
        HIPAA. However, we apply similar security standards to protect all data.
      </p>

      <h2>6. Data Sharing and Disclosure</h2>
      <p>We may share your information with:</p>
      <ul>
        <li>
          <strong>Service Providers:</strong> Third-party vendors who assist in operating our platform (cloud hosting,
          payment processing, AI services)
        </li>
        <li>
          <strong>AI Processing:</strong> Selected AI service providers for transcription and analysis (under strict
          data processing agreements)
        </li>
        <li>
          <strong>Legal Requirements:</strong> When required by law or to protect our rights
        </li>
        <li>
          <strong>Business Transfers:</strong> In connection with mergers, acquisitions, or asset sales
        </li>
      </ul>
      <p>We do not sell your personal information or veterinary data to third parties.</p>

      <h2>7. Data Retention</h2>
      <p>
        We retain your data for as long as your account is active or as needed to provide services. Consultation records
        are retained according to your clinic's configured retention period (default 90 days). You may request deletion
        of your data, subject to legal obligations.
      </p>

      <h2>8. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access your personal information</li>
        <li>Correct inaccurate data</li>
        <li>Request deletion of your data</li>
        <li>Export your data</li>
        <li>Opt-out of marketing communications</li>
        <li>Withdraw consent where applicable</li>
      </ul>
      <p>
        To exercise these rights, contact us at <a href="mailto:support@whiskr.ai">support@whiskr.ai</a>
      </p>

      <h2>9. Cookies and Tracking</h2>
      <p>
        We use cookies and similar technologies to maintain sessions, remember preferences, and analyze usage. You can
        control cookie settings through your browser.
      </p>

      <h2>10. International Data Transfers</h2>
      <p>
        Your data may be transferred to and processed in countries other than your own. We ensure appropriate safeguards
        are in place for such transfers.
      </p>

      <h2>11. Children's Privacy</h2>
      <p>
        Our services are not intended for individuals under 18 years of age. We do not knowingly collect information
        from children.
      </p>

      <h2>12. Changes to This Privacy Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the
        new policy and updating the "Last Updated" date.
      </p>

      <h2>13. Contact Us</h2>
      <p>If you have questions about this Privacy Policy, please contact us at:</p>
      <div className="company-info">
        <p className="mb-0">
          <strong>Email:</strong> <a href="mailto:support@whiskr.ai">support@whiskr.ai</a>
          <br />
          <strong>Address:</strong> 28 Geary St, STE 650 #5268, San Francisco, CA 94108
        </p>
      </div>

      <p className="mt-8 pt-6 border-t border-[#e2e8f0] text-sm">
        This Privacy Policy is part of our <Link to="/terms">Terms & Conditions</Link>.
      </p>
    </LegalPageLayout>
  );
}
