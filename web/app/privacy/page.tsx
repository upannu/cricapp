import { LegalPageShell } from "@/components/LegalPageShell";

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy">
      <p className="text-zinc-500 text-xs">Last updated: {new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</p>

      <p>
        This Privacy Policy explains how <strong>CRIC HQ PTY LTD</strong> (ABN 34 701 245 641) ("CRIC HQ",
        "we", "us", "our") collects, uses, and protects personal information through the CRIC HQ platform
        (the "Service"), in line with the Australian Privacy Act 1988 (Cth) and the Australian Privacy
        Principles.
      </p>

      <Section title="1. Information We Collect">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Account details — name, email, phone number, role (player, parent, coach, academy admin).</li>
          <li>Player performance data — bowling videos, biomechanics measurements (e.g. front knee angle, ball speed), session and attendance history, coaching notes and reports.</li>
          <li>Payment information — processed directly by Stripe; we do not store full card numbers.</li>
          <li>Location information — for the coach marketplace, to show nearby coaches (via Google Maps geocoding).</li>
          <li>Communications — messages sent through the Service, and contact form submissions.</li>
        </ul>
      </Section>

      <Section title="2. Children's Information">
        <p>
          Where a player is a minor, we collect their information only with a parent or guardian's
          consent, obtained through the account's guardian consent process. Parents/guardians can
          contact us at any time to review, correct, or request deletion of their child's information.
        </p>
      </Section>

      <Section title="3. How We Use Information">
        <p>
          We use this information to provide the Service — running sessions and bookings, generating
          AI-assisted biomechanics reports, processing payments, sending booking/payment notifications
          by email and SMS, and operating the coach marketplace. We do not sell personal information.
        </p>
      </Section>

      <Section title="4. Who We Share Information With">
        <p>We share information only with the service providers needed to run CRIC HQ:</p>
        <ul className="list-disc pl-5 space-y-1.5 mt-2">
          <li><strong>Stripe</strong> — payment processing and payouts.</li>
          <li><strong>Supabase</strong> — database, authentication, and file storage.</li>
          <li><strong>Anthropic</strong> — AI processing of session data/images to generate biomechanics reports and coaching content.</li>
          <li><strong>ClickSend</strong> — SMS delivery for booking and payment reminders.</li>
          <li><strong>Google Maps</strong> — geocoding for the coach marketplace.</li>
          <li><strong>Gmail / Google Workspace</strong> — sending transactional emails.</li>
        </ul>
        <p className="mt-2">
          Each of these providers only receives the information needed to perform their function for us.
        </p>
      </Section>

      <Section title="5. Data Security & Retention">
        <p>
          We use industry-standard measures (encrypted storage, access controls) to protect your
          information, and retain it for as long as your account is active or as needed to provide the
          Service and meet legal obligations. You can request deletion of your account and associated
          data at any time.
        </p>
      </Section>

      <Section title="6. Cookies">
        <p>
          We use cookies to keep you signed in and maintain your session. We don't use third-party
          advertising or tracking cookies.
        </p>
      </Section>

      <Section title="7. Your Rights">
        <p>
          Under the Australian Privacy Principles, you can request access to, correction of, or deletion
          of your personal information, and can lodge a complaint about how we handle it. Contact us
          using the details below, or the Office of the Australian Information Commissioner (OAIC) if
          you're not satisfied with our response.
        </p>
      </Section>

      <Section title="8. Changes to This Policy">
        <p>We may update this Privacy Policy from time to time; the "last updated" date above will change accordingly.</p>
      </Section>

      <Section title="9. Contact">
        <p>
          For any privacy questions or requests, contact us at{" "}
          <a href="mailto:support@crichq.com.au" className="text-pace-green hover:underline">support@crichq.com.au</a>{" "}
          or via our <a href="/contact" className="text-pace-green hover:underline">Contact page</a>.
        </p>
      </Section>
    </LegalPageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-2">{title}</h2>
      {children}
    </div>
  );
}
