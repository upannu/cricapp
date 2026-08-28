"use client";

import {
  createContext, useContext, useState, useEffect, useMemo, type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase";
import type { AuthUser, LinkedIdentity } from "./types";

type SignupRole = "academy_admin" | "coach" | "player" | "parent";

interface AuthContextValue {
  user: AuthUser | null;
  loaded: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  resendConfirmation: (email: string) => Promise<string | null>;
  signup: (name: string, email: string, password: string, role: SignupRole, playerLookupEmail?: string, academyName?: string, academyLocation?: string) => Promise<{ error: string | null; needsConfirmation: boolean; linked?: boolean; approved?: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loaded: false,
  login: async () => null,
  resendConfirmation: async () => null,
  signup: async () => ({ error: null, needsConfirmation: false }),
  logout: async () => {},
  refreshUser: async () => {},
});

function supabaseUserToAuthUser(sbUser: { id: string; email?: string; user_metadata: Record<string, unknown>; app_metadata: Record<string, unknown> }): AuthUser {
  // Security-sensitive fields (role, approved, and every identity link) live in app_metadata —
  // server-only, never client-writable. user_metadata is still where display-only `name` lives.
  const meta = sbUser.user_metadata ?? {};
  const secureMeta = sbUser.app_metadata ?? {};
  const linkedIdentities = secureMeta.linkedIdentities as LinkedIdentity[] | undefined;
  return {
    id: sbUser.id,
    name: (meta.name as string) ?? sbUser.email ?? "",
    email: sbUser.email ?? "",
    role: (secureMeta.role as AuthUser["role"]) ?? "coach",
    // Accounts without the flag (pre-existing/admin) are treated as approved
    approved: secureMeta.approved !== undefined ? (secureMeta.approved as boolean) : true,
    academyId: secureMeta.academy_id as string | undefined,
    coachId: secureMeta.coach_id as string | undefined,
    playerId: secureMeta.player_id as string | undefined,
    linkedIdentities: linkedIdentities && linkedIdentities.length > 1 ? linkedIdentities : undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: sbUser } }) => {
      setUser(sbUser ? supabaseUserToAuthUser(sbUser) : null);
      setLoaded(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? supabaseUserToAuthUser(session.user) : null);
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, password: string): Promise<string | null> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Surfaced as its own case rather than the generic "Invalid email or password." — a
      // just-signed-up user who hasn't confirmed yet (or whose confirmation link was consumed by
      // an email-scanning bot before they clicked it) needs a way to get a fresh link, not a
      // message that reads like their password is wrong.
      if (error.message.toLowerCase().includes("email not confirmed")) return "EMAIL_NOT_CONFIRMED";
      return error.message;
    }

    // A player whose session pack payment went unpaid past the grace period gets locked out here
    // — checked post-auth (self-read of their own player row) rather than pre-auth, since only an
    // authenticated request can read it under RLS. Reactivation is staff-only, never automatic.
    const playerId = data.user?.app_metadata?.player_id as string | undefined;
    if (playerId) {
      const { data: player } = await supabase
        .from("players")
        .select("login_disabled, disabled_reason")
        .eq("id", playerId)
        .maybeSingle();
      if (player?.login_disabled) {
        await supabase.auth.signOut();
        // Prefixed so the login page can show this specific, actionable message instead of its
        // generic "Invalid email or password." (which is deliberately vague for real credential
        // errors, but this case is reached only after a correct password, so there's nothing to
        // avoid revealing here).
        return `ACCOUNT_DISABLED::${player.disabled_reason || "Your account has been locked — contact your academy."}`;
      }
    }

    return null;
  }

  async function signup(
    name: string,
    email: string,
    password: string,
    role: SignupRole,
    playerLookupEmail?: string,
    academyName?: string,
    academyLocation?: string,
  ): Promise<{ error: string | null; needsConfirmation: boolean; linked?: boolean; approved?: boolean }> {
    // An email that already has an account can't go through signUp() again (Supabase returns an
    // ambiguous "ghost" response for a duplicate email rather than a clean error) — check first
    // and route into the "link an additional role" request instead of creating a new account.
    const existsRes = await fetch("/api/check-existing-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const existsData = await existsRes.json().catch(() => ({}));
    if (existsData?.exists) {
      const linkRes = await fetch("/api/request-additional-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role, playerLookupEmail: playerLookupEmail || null, academyName: academyName || null, academyLocation: academyLocation || null }),
      });
      const linkData = await linkRes.json().catch(() => ({}));
      if (!linkRes.ok) return { error: linkData?.error ?? "Could not submit request.", needsConfirmation: false };
      return { error: null, needsConfirmation: false, linked: true };
    }

    // options.data only ever sets user_metadata (client-writable, so never trust it for
    // authorization) — role/approved/player_id are decided server-side by /api/complete-signup
    // right below, which is the only place that can write app_metadata.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) return { error: error.message, needsConfirmation: false };
    let approved = false;
    if (data.user) {
      const completeRes = await fetch("/api/complete-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.user.id, name, email, role,
          playerLookupEmail: playerLookupEmail || null,
          academyName: academyName || null,
          academyLocation: academyLocation || null,
        }),
      });
      const completeData = await completeRes.json().catch(() => ({}));
      if (!completeRes.ok) return { error: completeData?.error ?? "Could not complete signup.", needsConfirmation: false };
      approved = !!completeData.approved;
    }
    const needsConfirmation = !data.session;
    return { error: null, needsConfirmation, approved };
  }

  async function resendConfirmation(email: string): Promise<string | null> {
    const { error } = await supabase.auth.resend({ type: "signup", email });
    return error ? error.message : null;
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
  }

  async function refreshUser() {
    const { data: { session } } = await supabase.auth.refreshSession();
    if (session?.user) setUser(supabaseUserToAuthUser(session.user));
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loaded, login, signup, logout, refreshUser, resendConfirmation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useScopedData() {
  const { user } = useAuth();

  const scopedPlayerIds = useMemo<string[] | null>(() => {
    if (!user || user.role === "platform_admin") return null;
    return null; // resolved dynamically in hooks via DB queries
  }, [user]);

  const scopedCoachIds = useMemo<string[] | null>(() => {
    if (!user || user.role === "platform_admin") return null;
    if (user.role === "academy_admin") return null;
    return user.coachId ? [user.coachId] : [];
  }, [user]);

  const scopedAcademyIds = useMemo<string[] | null>(() => {
    if (!user || user.role === "platform_admin") return null;
    if (user.role === "academy_admin") return user.academyId ? [user.academyId] : [];
    return null;
  }, [user]);

  function canAccessPlayer(id: string) {
    return scopedPlayerIds === null || scopedPlayerIds.includes(id);
  }

  return { user, scopedPlayerIds, scopedCoachIds, scopedAcademyIds, canAccessPlayer };
}

// Kept for login page demo buttons
export const DEMO_ACCOUNTS = [
  { id: "u001", name: "Sukhi Pannu",  email: "sukhi@pacehq.com",  role: "platform_admin" as const },
  { id: "u002", name: "Arjun Sharma", email: "arjun@pacehq.com",  role: "academy_admin"  as const },
  { id: "u003", name: "Lisa Nguyen",  email: "lisa@pacehq.com",   role: "academy_admin"  as const },
  { id: "u004", name: "Marcus Webb",  email: "marcus@pacehq.com", role: "coach"          as const },
];
