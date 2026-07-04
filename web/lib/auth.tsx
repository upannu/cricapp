"use client";

import {
  createContext, useContext, useState, useEffect, useMemo, type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase";
import type { AuthUser } from "./types";

type SignupRole = "academy_admin" | "coach" | "player" | "parent";

interface AuthContextValue {
  user: AuthUser | null;
  loaded: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  signup: (name: string, email: string, password: string, role: SignupRole, playerLookupEmail?: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loaded: false,
  login: async () => null,
  signup: async () => ({ error: null, needsConfirmation: false }),
  logout: async () => {},
  refreshUser: async () => {},
});

function supabaseUserToAuthUser(sbUser: { id: string; email?: string; user_metadata: Record<string, unknown> }): AuthUser {
  const meta = sbUser.user_metadata ?? {};
  return {
    id: sbUser.id,
    name: (meta.name as string) ?? sbUser.email ?? "",
    email: sbUser.email ?? "",
    role: (meta.role as AuthUser["role"]) ?? "coach",
    // Accounts without the flag (pre-existing/admin) are treated as approved
    approved: meta.approved !== undefined ? (meta.approved as boolean) : true,
    academyId: meta.academy_id as string | undefined,
    coachId: meta.coach_id as string | undefined,
    playerId: meta.player_id as string | undefined,
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }

  async function signup(
    name: string,
    email: string,
    password: string,
    role: SignupRole,
    playerLookupEmail?: string,
  ): Promise<{ error: string | null; needsConfirmation: boolean }> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role, approved: false } },
    });
    if (error) return { error: error.message, needsConfirmation: false };
    // Record the request for platform admin approval
    if (data.user) {
      await supabase.from("user_requests").insert({
        id: data.user.id,
        name,
        email,
        role,
        requested_at: new Date().toISOString(),
        player_lookup_email: playerLookupEmail || null,
      });
      // Fire-and-forget — don't block signup on email failure
      fetch("/api/notify-admin-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      }).catch(() => {});
    }
    const needsConfirmation = !data.session;
    return { error: null, needsConfirmation };
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
    <AuthContext.Provider value={{ user, loaded, login, signup, logout, refreshUser }}>
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
