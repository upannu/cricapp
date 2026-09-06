import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // API routes that must work whether or not the caller has a session — some are hit before any
  // session exists (signup flow, email confirmation not done yet), others (check-existing-account,
  // request-additional-role) can legitimately be called by an *already logged-in* user requesting
  // an additional linked role, so they must never be redirected either way.
  const isAuthApi =
    pathname.startsWith("/api/request-signup-link") ||
    pathname.startsWith("/api/notify-admin-signup") ||
    pathname.startsWith("/api/check-existing-account") ||
    pathname.startsWith("/api/request-additional-role") ||
    // Runs right after signUp() to set the account's real role/approval — the caller has no
    // session yet if email confirmation is required.
    pathname.startsWith("/api/complete-signup") ||
    // Stripe calls this server-to-server with no Supabase session cookie — it authenticates
    // via its own HMAC signature (verified inside the route), not via signed-in user session.
    pathname.startsWith("/api/stripe/webhook") ||
    // Same story for every scheduled cron route — triggered by GitHub Actions with no session
    // cookie, each authenticated via its own CRON_SECRET bearer token (verified inside the route).
    pathname.startsWith("/api/cron/") ||
    // Contact form can be submitted by a signed-out visitor.
    pathname.startsWith("/api/contact") ||
    // Public player-registration page (/register) — gated by its own shared code, not a session.
    pathname.startsWith("/api/public-register-player") ||
    // Every auth email link (reset password, invite, etc.) lands here first, with no session yet
    // — it verifies the link's own token and only then redirects into the app.
    pathname.startsWith("/auth/confirm");

  const isPublicPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");

  // Legal/info pages are public but, unlike /login etc., stay visible to a signed-in user too —
  // no reason to bounce someone reading the Terms just because they're logged in.
  const isAlwaysPublicPage =
    pathname.startsWith("/about") ||
    pathname.startsWith("/contact") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/privacy") ||
    // Public, code-gated player-registration page — a coach/staff member should be able to open
    // it too (e.g. to demo it to a parent) without getting bounced.
    pathname.startsWith("/register");

  if (!user && !isPublicPage && !isAlwaysPublicPage && !isAuthApi) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // An already-logged-in user can still visit /signup — that's how they request an additional
  // role be linked to their existing account. /reset-password must also stay reachable while
  // logged in: the recovery link's token lives in the URL hash, which a server redirect would
  // silently drop before the page ever gets to read it — bouncing someone to /players here means
  // their password reset link just silently does nothing if their browser still has an old
  // session cookie. Every other public page bounces them to /players.
  if (user && isPublicPage && pathname !== "/signup" && pathname !== "/reset-password") {
    return NextResponse.redirect(new URL("/players", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)",
  ],
};
