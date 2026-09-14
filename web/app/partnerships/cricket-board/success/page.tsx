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
        <div className="w-14 h-14 rounded-full bg-pace-green/10 border border-pace-green/30 flex items-center justify-center mx-auto mb-6 text-2xl">
          ✓
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">Application received</h1>
        <p className="text-zinc-400 text-sm mb-6">
          Thanks for your interest in partnering with CRIC HQ. Our team will review your application and get back to you shortly.
        </p>
        {ref && (
          <div className="inline-block bg-surface rounded-xl px-5 py-3 mb-8">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Reference</p>
            <p className="text-white font-mono font-bold">{ref}</p>
          </div>
        )}
        <div>
          <Link href="/"
            className="inline-block px-6 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
            Return to CRIC HQ
          </Link>
        </div>
      </div>
    </PartnershipPageShell>
  );
}
