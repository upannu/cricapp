"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PartnershipActivityEntry, PartnershipApplication, PartnershipStatus } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

const STATUS_STYLES: Record<PartnershipStatus, string> = {
  submitted: "bg-blue-500/15 text-blue-400",
  under_review: "bg-amber/15 text-amber",
  needs_information: "bg-amber/15 text-amber",
  qualified: "bg-pace-green/15 text-pace-green",
  declined: "bg-red-500/15 text-red-400",
  withdrawn: "bg-zinc-700 text-zinc-400",
};

const STATUS_LABELS: Record<PartnershipStatus, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  needs_information: "Needs Information",
  qualified: "Qualified",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

const ACTIVITY_LABELS: Record<string, string> = {
  submitted: "Application submitted",
  status_change: "Status changed",
  assigned: "Assigned",
  note: "Note",
  email_sent: "Email sent",
};

// Mirrors PartnershipApplicationForm's INTERESTS ids → title, so the raw slugs stored on the row
// (e.g. "ai_video_analysis") render as the same human-readable label the applicant saw when
// selecting them.
const INTEREST_LABELS: Record<string, string> = {
  player_development: "Player Development",
  coach_management: "Coach Management",
  academy_management: "Academy Management",
  performance_analytics: "Performance Analytics",
  ai_video_analysis: "AI Video Analysis",
  talent_identification: "Talent Identification",
  board_reporting: "Board Reporting",
  centralised_data: "Centralised Data",
  custom_integrations: "Custom Integrations",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-white text-sm">{value}</p>
    </div>
  );
}

/** Detail view for a single Cricket Board Partnership application — read-only for now (status
 * change, priority, and owner assignment are natural follow-ups, not built yet). Reads through
 * /api/partnerships/[id], same service-role rationale as the list view. */
export function PartnershipDetailClient({ id }: { id: string }) {
  const { user } = useAuth();
  const router = useRouter();

  const [application, setApplication] = useState<PartnershipApplication | null>(null);
  const [activity, setActivity] = useState<PartnershipActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (user && user.role !== "platform_admin") { router.replace("/players"); return; }
  }, [user, router]);

  useEffect(() => {
    fetch(`/api/partnerships/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setApplication(data.application);
        setActivity(data.activity ?? []);
      })
      .catch((err) => setLoadError((err as { message?: string })?.message ?? String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  if (!user || user.role !== "platform_admin") return null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <Link href="/admin/partnerships" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors mb-6">
        ← Back to Partnerships
      </Link>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
        </div>
      ) : loadError ? (
        <p className="text-red-400 text-sm">{loadError}</p>
      ) : !application ? null : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">{application.organisationName}</h1>
              <p className="text-zinc-500 text-sm">{application.reference} · Submitted {formatDate(application.createdAt)}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[application.status]}`}>
              {STATUS_LABELS[application.status]}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <div className="bg-surface rounded-2xl p-6">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-4">Organisation</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Type" value={application.organisationType} />
                  <Field label="Country" value={application.region ? `${application.country}, ${application.region}` : application.country} />
                  <Field label="Website" value={application.website && (
                    <a href={application.website} target="_blank" rel="noreferrer" className="text-pace-green hover:underline">{application.website}</a>
                  )} />
                </div>
                {(application.scalePlayers || application.scaleCoaches || application.scaleAcademies || application.scaleRegions) && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-zinc-800">
                    <Field label="Players" value={application.scalePlayers} />
                    <Field label="Coaches" value={application.scaleCoaches} />
                    <Field label="Academies" value={application.scaleAcademies} />
                    <Field label="Regions" value={application.scaleRegions} />
                  </div>
                )}
              </div>

              {(application.interests.length > 0 || application.challenges || application.currentSystems.length > 0 || application.timeline) && (
                <div className="bg-surface rounded-2xl p-6">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-4">Requirements</h2>
                  <div className="space-y-4">
                    {application.interests.length > 0 && (
                      <Field label="Interested In" value={application.interests.map((id) => INTEREST_LABELS[id] ?? id).join(", ")} />
                    )}
                    <Field label="Challenges" value={application.challenges} />
                    {application.currentSystems.length > 0 && (
                      <Field label="Current Systems" value={application.currentSystems.join(", ")} />
                    )}
                    <Field label="Timeline" value={application.timeline} />
                  </div>
                </div>
              )}

              <div className="bg-surface rounded-2xl p-6">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-4">Contact</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Name" value={`${application.contactFirstName} ${application.contactLastName}`} />
                  <Field label="Job Title" value={application.jobTitle} />
                  <Field label="Email" value={<a href={`mailto:${application.email}`} className="text-pace-green hover:underline">{application.email}</a>} />
                  <Field label="Phone" value={application.phone} />
                  <Field label="Budget" value={application.budgetRange} />
                </div>
                {application.additionalNotes && (
                  <div className="mt-4 pt-4 border-t border-zinc-800">
                    <Field label="Additional Notes" value={application.additionalNotes} />
                  </div>
                )}
              </div>
            </div>

            <div className="bg-surface rounded-2xl p-6 h-fit">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-4">Activity</h2>
              {activity.length === 0 ? (
                <p className="text-zinc-500 text-sm">No activity yet.</p>
              ) : (
                <ul className="space-y-4">
                  {activity.map((entry) => (
                    <li key={entry.id} className="text-sm">
                      <p className="text-white font-semibold">{ACTIVITY_LABELS[entry.kind] ?? entry.kind}</p>
                      {entry.body && <p className="text-zinc-400 mt-0.5">{entry.body}</p>}
                      <p className="text-zinc-600 text-xs mt-0.5">{formatDate(entry.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
