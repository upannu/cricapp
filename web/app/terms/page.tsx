import { LegalPageShell } from "@/components/LegalPageShell";

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms &amp; Conditions">
      <p className="text-zinc-500 text-xs">Last updated: {new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</p>

      <p>
        These Terms & Conditions ("Terms") govern your access to and use of CRIC HQ, an online platform
        for cricket coaching academies, coaches, players, and parents (the "Service"), provided by
        <strong> CRIC HQ PTY LTD</strong> (ABN 34 701 245 641) ("CRIC HQ", "we", "us", "our"). By creating
        an account or otherwise using the Service, you agree to these Terms.
      </p>

      <Section title="1. The Service">
        <p>
          CRIC HQ lets cricket academies manage players, coaches, and sessions; lets coaches and players
          book and pay for individual coaching sessions and session packs; provides AI-assisted bowling
          biomechanics video analysis and coaching reports; and includes a marketplace for players to
          find coaches.
        </p>
      </Section>

      <Section title="2. Accounts & Eligibility">
        <p>
          You must provide accurate information when creating an account. Where a player is a minor, a
          parent or guardian must create or confirm the account and consent to its use on the player's
          behalf, including consent for video capture and AI-assisted analysis of the player's bowling
          action. Academy admins and coaches are responsible for the accuracy of information they enter
          about players under their care.
        </p>
      </Section>

      <Section title="3. Payments & Subscriptions">
        <p>
          Session fees, session packs, individual subscriptions ("Player Pro" / "Coach Pro"), and academy
          licenses are processed through Stripe. We do not store your full card details. Prices are shown
          in AUD unless stated otherwise. Fees for services already delivered are generally
          non-refundable, except where required by the Australian Consumer Law or at our discretion.
          Recurring subscriptions renew automatically until cancelled through your account or Stripe's
          billing portal.
        </p>
      </Section>

      <Section title="4. AI-Generated Content">
        <p>
          Biomechanics reports, coaching narratives, and other AI-assisted content are generated
          automatically and can make mistakes. AI-generated content should be discussed with a qualified
          coach before being acted on, and is not a substitute for professional coaching or medical
          advice.
        </p>
      </Section>

      <Section title="5. Acceptable Use">
        <p>
          You agree not to misuse the Service — including uploading content you don't have the right to
          share, attempting to access accounts or data that aren't yours, or using the Service in a way
          that could harm CRIC HQ, other users, or third parties.
        </p>
      </Section>

      <Section title="6. Intellectual Property">
        <p>
          CRIC HQ and its original content, features, and functionality belong to CRIC HQ PTY LTD. Video
          and performance data you upload remains yours — by uploading it, you grant us a licence to
          store and process it solely to provide the Service to you (including generating your AI
          reports).
        </p>
      </Section>

      <Section title="7. Termination">
        <p>
          We may suspend or terminate accounts that breach these Terms or misuse the Service. You may
          close your account at any time by contacting us.
        </p>
      </Section>

      <Section title="8. Liability">
        <p>
          To the extent permitted by law, CRIC HQ is not liable for indirect or consequential losses
          arising from use of the Service. Nothing in these Terms excludes rights you have under the
          Australian Consumer Law that cannot lawfully be excluded.
        </p>
      </Section>

      <Section title="9. Changes to These Terms">
        <p>
          We may update these Terms from time to time. Continued use of the Service after an update
          means you accept the revised Terms.
        </p>
      </Section>

      <Section title="10. Governing Law">
        <p>These Terms are governed by the laws of Australia.</p>
      </Section>

      <Section title="11. Contact">
        <p>
          Questions about these Terms? Reach us at{" "}
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
