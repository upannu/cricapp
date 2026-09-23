import Link from "next/link";
import { PartnershipPageShell } from "@/components/PartnershipPageShell";

export const metadata = { title: "Application Received — CRIC HQ" };

/** `ref` is the human-readable reference the apply flow generated (see api/partnerships/apply's
 * displayReference) — shown here purely for the applicant's own records, not looked up or
 * validated against the DB (this page has no auth, so it can't safely confirm anything back). */
export default async function CricketBoardSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;

  return (
    <PartnershipPageShell minimal>
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <div className="w-14 h-14 rounded-full border border-hp-cg/30 bg-hp-cg/10 flex items-center justify-center mx-auto mb-6 text-2xl text-hp-cg">
          ✓
        </div>
        <h1 className="font-display font-black uppercase text-2xl text-hp-paper mb-3">Application Received</h1>
        <p className="text-hp-paper/55 text-sm mb-6">
          Thanks for your interest in partnering with CRIC HQ. Our team will review your application and get back to you shortly.
        </p>
        {ref && (
          <div className="inline-block border border-white/10 px-5 py-3 mb-8">
            <p className="text-xs text-hp-paper/40 font-mono uppercase tracking-wider mb-1">Reference</p>
            <p className="text-hp-paper font-mono font-bold">{ref}</p>
          </div>
        )}
        <div>
          <Link href="/"
            className="inline-block px-6 py-2.5 bg-hp-cg text-hp-paper text-sm font-display font-black uppercase tracking-wider hover:bg-hp-cg/90 transition-colors">
            Return to CRIC HQ
          </Link>
        </div>
      </div>
    </PartnershipPageShell>
  );
}
