import { LegalPageShell } from "@/components/LegalPageShell";

export default function AboutPage() {
  return (
    <LegalPageShell title="About CRIC HQ">
      <p>
        CRIC HQ PTY LTD (ABN 34 701 245 641) builds AI-powered tools for cricket fast bowling
        coaching — from grassroots academies to elite performance programs. Our mission is simple:
        every degree of the bowling action, measured, so coaches can spend less time guessing and
        more time coaching.
      </p>

      <Section title="What we do">
        <p>
          CRIC HQ turns a phone video of a bowling delivery into AI-assisted biomechanics
          analysis — no lab, no lasers, no specialist equipment. Alongside that, the platform gives
          academies and coaches the day-to-day tools to run a coaching business: player and coach
          management, session bookings and packs, attendance, progress tracking, and a marketplace
          where players can discover and book coaches directly.
        </p>
      </Section>

      <Section title="Who it's for">
        <p>
          <strong className="text-white">Coaches and academy directors</strong> get a single place
          to manage players, schedule sessions, and review biomechanics reports alongside their
          existing coaching workflow. <strong className="text-white">Players and parents</strong>{" "}
          get visibility into progress over time — reports, drills, and a clear record of every
          session.
        </p>
      </Section>

      <Section title="Get in touch">
        <p>
          Questions about CRIC HQ, your academy, or a partnership? Reach us at{" "}
          <a href="mailto:support@crichq.com.au" className="text-pace-green hover:underline">support@crichq.com.au</a>{" "}
          or via the <a href="/contact" className="text-pace-green hover:underline">Contact page</a>.
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
