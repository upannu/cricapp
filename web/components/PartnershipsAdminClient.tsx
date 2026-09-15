"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PartnershipApplication, PartnershipStatus } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { SortableHeader } from "@/components/SortableHeader";
import { useSort } from "@/lib/useSort";
import { PaginationFooter } from "@/components/PaginationFooter";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { EyeIcon } from "@/components/icons";

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

type SortKey = "organisation" | "status" | "submitted";
const PAGE_SIZE = 25;

/**
 * The admin list for Cricket Board Partnership applications submitted via the public
 * /partnerships/cricket-board/apply form — reads through /api/partnerships/list rather than a
 * browser-client lib/db.ts fetch, since partnership_applications has no RLS grant for the
 * authenticated role (see that route's own doc comment).
 */
export function PartnershipsAdminClient() {
  const { user } = useAuth();
  const router = useRouter();

  const [applications, setApplications] = useState<PartnershipApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { sortKey, sortDir, handleSort } = useSort<SortKey>("submitted", "desc");

  useEffect(() => {
    if (user && user.role !== "platform_admin") { router.replace("/players"); return; }
  }, [user, router]);

  useEffect(() => {
    fetch("/api/partnerships/list")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setApplications(data.applications ?? []);
      })
      .catch((err) => setLoadError((err as { message?: string })?.message ?? String(err)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = !q ? applications : applications.filter((a) =>
      a.organisationName.toLowerCase().includes(q) ||
      `${a.contactFirstName} ${a.contactLastName}`.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      a.reference.toLowerCase().includes(q),
    );
    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "organisation") cmp = a.organisationName.localeCompare(b.organisationName);
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      else cmp = a.createdAt.localeCompare(b.createdAt);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [applications, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!user || user.role !== "platform_admin") return null;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-white mb-1">Cricket Board Partnerships</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Applications submitted via the public partnership form at /partnerships/cricket-board.
      </p>

      <div className="mb-4">
        <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search organisation, contact, email or reference"
          className="w-full max-w-sm bg-surface rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none text-sm" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
        </div>
      ) : loadError ? (
        <p className="text-red-400 text-sm">{loadError}</p>
      ) : filtered.length === 0 ? (
        <div className="bg-surface rounded-2xl p-10 text-center">
          <p className="text-zinc-400 text-sm">{applications.length === 0 ? "No applications yet." : "No applications match your search."}</p>
        </div>
      ) : (
        <>
          <div className="bg-surface rounded-2xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <SortableHeader label="Organisation" sortKey="organisation" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <th className="text-xs font-semibold uppercase tracking-wider px-4 py-3 text-left">Type</th>
                  <th className="text-xs font-semibold uppercase tracking-wider px-4 py-3 text-left">Contact</th>
                  <SortableHeader label="Status" sortKey="status" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortableHeader label="Submitted" sortKey="submitted" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((a) => (
                  <tr key={a.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-4">
                      <p className="text-white font-semibold">{a.organisationName}</p>
                      <p className="text-zinc-500 text-xs">{a.reference}</p>
                    </td>
                    <td className="px-4 py-4 text-zinc-300">{a.organisationType}</td>
                    <td className="px-4 py-4">
                      <p className="text-zinc-300">{a.contactFirstName} {a.contactLastName}</p>
                      <p className="text-zinc-500 text-xs">{a.email}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[a.status]}`}>
                        {STATUS_LABELS[a.status]}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-zinc-500">{formatDate(a.createdAt)}</td>
                    <td className="px-4 py-4">
                      <RowActionsMenu items={[
                        { label: "View", icon: <EyeIcon />, onClick: () => router.push(`/admin/partnerships/${a.id}`) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationFooter
            label={<span>{filtered.length} application{filtered.length === 1 ? "" : "s"}</span>}
            page={page} totalPages={totalPages} onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
