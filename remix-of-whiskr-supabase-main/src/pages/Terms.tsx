import { LegalPageLayout } from "@/components/layout/LegalPageLayout";
import { Link } from "react-router-dom";

export default function Terms() {
  return (
    <LegalPageLayout title="Terms and Conditions" lastUpdated="January 29, 2026">
      <div className="alert-box">
        <strong>Important Legal Disclaimer</strong>
        <p className="mt-2 mb-0">
          THIS PLATFORM IS FOR EDUCATIONAL AND DOCUMENTATION PURPOSES ONLY. IT DOES NOT PROVIDE MEDICAL ADVICE,
          DIAGNOSIS, OR TREATMENT. ALWAYS EXERCISE YOUR PROFESSIONAL JUDGMENT AND CONSULT APPROPRIATE RESOURCES FOR
          MEDICAL DECISIONS.
        </p>
      </div>

      <h2>1. Agreement to Terms</h2>
      <p>
        These Terms and Conditions ("Terms") govern your use of whiskr, operated by Whiskr Inc, a Delaware C Corporation
        ("Company," "we," "us," or "our"). By accessing or using our platform, you agree to be bound by these Terms.
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

      <h2>3. Educational Purpose and Disclaimer</h2>
      <p>
        <strong>CRITICAL DISCLAIMERS:</strong>
      </p>
      <ul>
        <li>
          <strong>NOT MEDICAL ADVICE:</strong> This platform is a documentation and educational tool ONLY. It does not
          provide veterinary medical advice, diagnosis, or treatment recommendations.
        </li>
        <li>
          <strong>PROFESSIONAL RESPONSIBILITY:</strong> You, as a licensed veterinary professional, are solely
          responsible for all medical decisions, diagnoses, and treatments. Do not rely on AI-generated content for
          medical decision-making.
        </li>
        <li>
          <strong>AI LIMITATIONS:</strong> AI-generated content may contain errors, omissions, or inaccuracies. Always
          verify information and use your professional judgment.
        </li>
        <li>
          <strong>NO GUARANTEE:</strong> We make no warranties about the accuracy, completeness, or reliability of any
          AI-generated content or documentation.
        </li>
        <li>
          <strong>EMERGENCY SITUATIONS:</strong> This platform is not designed for emergency veterinary situations.
          Always follow standard emergency protocols.
        </li>
        <li>
          <strong>REGULATORY COMPLIANCE:</strong> You are responsible for ensuring your use of this platform complies
          with all applicable veterinary medical board regulations and professional standards.
        </li>
      </ul>

      <h2>4. Eligibility and Account Requirements</h2>
      <p>You must:</p>
      <ul>
        <li>Be a licensed veterinary professional or authorized clinic staff</li>
        <li>Be at least 18 years of age</li>
        <li>Have authority to bind your clinic to these Terms</li>
        <li>Provide accurate and complete registration information</li>
        <li>Maintain the security of your account credentials</li>
        <li>Notify us immediately of any unauthorized access</li>
      </ul>

      <h2>5. Acceptable Use</h2>
      <p>You agree NOT to:</p>
      <ul>
        <li>Use the platform for any illegal or unauthorized purpose</li>
        <li>Upload malicious code, viruses, or harmful content</li>
        <li>Attempt to gain unauthorized access to our systems</li>
        <li>Reverse engineer or copy our software</li>
        <li>Share your account credentials with unauthorized users</li>
        <li>Use the platform to harass, abuse, or harm others</li>
        <li>Violate any applicable laws or regulations</li>
        <li>Use AI-generated content as a substitute for professional medical judgment</li>
      </ul>

      <h2>6. Intellectual Property</h2>
      <p>
        <strong>Our Rights:</strong> The platform, including all software, designs, text, graphics, and AI models, is
        owned by whiskr and protected by copyright, trademark, and other intellectual property laws.
      </p>
      <p>
        <strong>Your Content:</strong> You retain ownership of your veterinary data and patient records. By using our
        service, you grant us a limited license to process, store, and use your content solely to provide and improve
        our services.
      </p>
      <p>
        <strong>AI Training:</strong> We may use anonymized and aggregated data to improve our AI models, but we will
        not use identifiable patient information without explicit consent.
      </p>

      <h2>7. Payment and Subscriptions</h2>
      <ul>
        <li>Subscription fees are billed according to your selected plan</li>
        <li>Payments are non-refundable except as required by law</li>
        <li>We may change pricing with 30 days' notice</li>
        <li>You authorize us to charge your payment method automatically</li>
        <li>Failure to pay may result in service suspension or termination</li>
        <li>Trial periods may be offered at our discretion</li>
      </ul>

      <h2>8. Data Security and Privacy</h2>
      <p>
        We implement reasonable security measures to protect your data, but no system is completely secure. See our{" "}
        <Link to="/privacy">Privacy Policy</Link> for detailed information on data handling. You acknowledge that
        electronic transmission and storage carries inherent risks.
      </p>

      <h2>9. Limitation of Liability</h2>
      <p>
        <strong>TO THE MAXIMUM EXTENT PERMITTED BY LAW:</strong>
      </p>
      <ul>
        <li>
          WE ARE NOT LIABLE FOR ANY VETERINARY MEDICAL DECISIONS, DIAGNOSES, OR TREATMENTS MADE USING THIS PLATFORM
        </li>
        <li>WE ARE NOT LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES</li>
        <li>OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNTS PAID BY YOU IN THE 12 MONTHS PRECEDING THE CLAIM</li>
        <li>WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE</li>
        <li>WE ARE NOT LIABLE FOR ANY DATA LOSS, CORRUPTION, OR UNAUTHORIZED ACCESS</li>
        <li>WE ARE NOT LIABLE FOR ANY HARM TO ANIMALS RESULTING FROM YOUR USE OF THE PLATFORM</li>
      </ul>

      <h2>10. Indemnification</h2>
      <p>
        You agree to indemnify, defend, and hold harmless whiskr and Whiskr Inc, its officers, directors, employees, and
        agents from any claims, damages, losses, liabilities, and expenses (including attorneys' fees) arising from: (a)
        your use of the platform, (b) your violation of these Terms, (c) your violation of any laws or regulations, or
        (d) any veterinary medical decisions or treatments you provide.
      </p>

      <h2>11. Service Modifications and Termination</h2>
      <p>We reserve the right to:</p>
      <ul>
        <li>Modify or discontinue any feature or service with or without notice</li>
        <li>Suspend or terminate your account for violations of these Terms</li>
        <li>Refuse service to anyone at our discretion</li>
        <li>Perform maintenance that may cause temporary service interruptions</li>
      </ul>
      <p>You may terminate your account at any time through your account settings or by contacting us.</p>

      <h2>12. Warranty Disclaimer</h2>
      <p>
        <strong>
          THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
          INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
          NON-INFRINGEMENT, OR ACCURACY OF AI-GENERATED CONTENT.
        </strong>
      </p>

      <h2>13. Dispute Resolution and Governing Law</h2>
      <p>
        <strong>Governing Law:</strong> These Terms are governed by the laws of the State of Delaware, without regard to
        conflict of law principles.
      </p>
      <p>
        <strong>Arbitration:</strong> Any disputes arising from these Terms or your use of the platform shall be
        resolved through binding arbitration in accordance with the American Arbitration Association's rules, except as
        otherwise required by law.
      </p>
      <p>
        <strong>Venue:</strong> Any legal actions not subject to arbitration shall be brought exclusively in the state
        or federal courts located in Delaware.
      </p>

      <h2>14. Changes to Terms</h2>
      <p>
        We may modify these Terms at any time. Material changes will be notified via email or platform notification.
        Continued use after changes constitutes acceptance of the modified Terms.
      </p>

      <h2>15. Severability</h2>
      <p>
        If any provision of these Terms is found to be unenforceable, the remaining provisions will remain in full force
        and effect.
      </p>

      <h2>16. Entire Agreement</h2>
      <p>
        These Terms, together with our <Link to="/privacy">Privacy Policy</Link>, constitute the entire agreement
        between you and whiskr regarding the use of our platform.
      </p>

      <h2>17. Contact Information</h2>
      <p>For questions about these Terms, contact us at:</p>
      <div className="company-info">
        <p className="mb-0">
          <strong>Email:</strong> <a href="mailto:support@whiskr.ai">support@whiskr.ai</a>
          <br />
          <strong>Address:</strong> 28 Geary St, STE 650 #5268, San Francisco, CA 94108
        </p>
      </div>

      <h2>18. Acknowledgment</h2>
      <p>
        <strong>
          BY USING THIS PLATFORM, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THESE TERMS
          AND CONDITIONS, INCLUDING ALL DISCLAIMERS AND LIMITATIONS OF LIABILITY.
        </strong>
      </p>
    </LegalPageLayout>
  );
}
