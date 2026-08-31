"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { fetchCoach } from "@/lib/db";
import type { Coach } from "@/lib/types";
import { CoachSubscriptionPage } from "@/components/CoachSubscriptionPage";

export function CoachSubscriptionClient() {
  const { user } = useAuth();
  const [coach, setCoach] = useState<Coach | null | undefined>(undefined);

  useEffect(() => {
    if (!user?.coachId) { setCoach(null); return; }
    fetchCoach(user.coachId).then(setCoach);
  }, [user]);

  if (coach === undefined) return null;
  if (!coach) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center text-zinc-400">
        No coach profile found for this account.
      </div>
    );
  }
  return <CoachSubscriptionPage coach={coach} />;
}
