"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!user) {
      router.replace("/login");
    }
  }, [user, router]);

  if (!user) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user.approved) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-surface rounded-2xl p-10 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-amber/10 border border-amber/30 flex items-center justify-center mx-auto mb-6">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Awaiting Approval</h2>
            <p className="text-zinc-400 text-sm leading-relaxed mb-2">
              Your account is <span className="text-amber font-semibold">pending review</span> by a platform admin.
            </p>
            <p className="text-zinc-500 text-xs mb-8">
              You&apos;ll be notified once your account is approved. Click below to check your status.
            </p>
            <button
              type="button"
              disabled={checking}
              onClick={async () => {
                setChecking(true);
                await refreshUser();
                setChecking(false);
              }}
              className="w-full px-4 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60 mb-3"
            >
              {checking ? "Checking…" : "Check approval status"}
            </button>
            <button
              type="button"
              onClick={() => { logout(); router.push("/login"); }}
              className="text-sm text-zinc-500 hover:text-white transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
