"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getReportPdfUrl } from "@/lib/utils";

export function ReportActions({
  reportId,
  playerId,
  hasPdf,
  onDeleted,
}: {
  reportId: string;
  playerId: string;
  hasPdf: boolean;
  onDeleted?: (reportId: string) => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [emailing, setEmailing] = useState(false);
  const [emailStatus, setEmailStatus] = useState<"sent" | "error" | null>(null);
  const [emailError, setEmailError] = useState("");

  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/reports/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, playerId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to delete report");

      if (onDeleted) onDeleted(reportId);
      else router.refresh();
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
      setDeleting(false);
    }
  }

  async function handleEmail() {
    setEmailing(true);
    setEmailStatus(null);
    setEmailError("");
    try {
      const res = await fetch("/api/reports/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, playerId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to send email");
      setEmailStatus("sent");
    } catch (err) {
      setEmailError((err as { message?: string })?.message ?? String(err));
      setEmailStatus("error");
    } finally {
      setEmailing(false);
      setTimeout(() => setEmailStatus(null), 4000);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasPdf && (
        <a
          href={getReportPdfUrl(playerId, reportId)}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 text-xs font-semibold text-pace-green border border-pace-green/30 rounded-lg hover:bg-pace-green/10 transition-colors"
        >
          Download PDF
        </a>
      )}
      {emailStatus === "sent" ? (
        <span className="px-3 py-1.5 text-xs font-semibold text-pace-green">✓ Email sent</span>
      ) : (
        <button
          type="button"
          onClick={handleEmail}
          disabled={emailing}
          className="px-3 py-1.5 text-xs font-semibold text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors disabled:opacity-60 cursor-pointer"
        >
          {emailing ? "Sending…" : "Email Report"}
        </button>
      )}
      {confirming ? (
        <>
          <span className="text-xs text-zinc-400">Delete this report?</span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-1.5 text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {deleting ? "Deleting…" : "Confirm delete"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={deleting}
            className="px-3 py-1.5 text-xs font-semibold text-zinc-400 border border-zinc-700 rounded-lg hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="px-3 py-1.5 text-xs font-semibold text-zinc-500 border border-zinc-700 rounded-lg hover:text-red-400 hover:border-red-500/40 transition-colors cursor-pointer"
        >
          Delete Report
        </button>
      )}
      {error && <span className="w-full text-xs font-semibold text-red-400">{error}</span>}
      {emailStatus === "error" && (
        <span className="w-full text-xs font-semibold text-red-400">{emailError}</span>
      )}
    </div>
  );
}
