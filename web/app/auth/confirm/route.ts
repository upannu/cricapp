import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

// Every auth email link (Reset Password, Invite user, Confirm signup, etc. — see Supabase
// dashboard → Authentication → Email Templates) must point here as {{ .SiteURL }}/auth/confirm,
// not straight at the app page. Two independent problems otherwise:
//
// 1. Supabase's own hosted /auth/v1/verify redirect (the default action link) hands the app an
//    *implicit*-flow callback — a #access_token=... hash fragment — regardless of type. But this
//    app's browser client (@supabase/ssr's createBrowserClient) is hardcoded to PKCE only and
//    throws internally on an implicit callback URL, silently, with no event ever firing. The
//    result: /reset-password just spins on "Verifying your link…" forever for every invite and
//    every password reset, with zero error surfaced anywhere.
// 2. Even the cases where Supabase does emit a PKCE `?code=` (real user-triggered
//    resetPasswordForEmail() calls, not admin-triggered ones like inviteUserByEmail) still need a
//    code_verifier that only exists in the exact browser that requested the link — opening the
//    email in a different browser/device than the one that requested it can never complete.
//
// verifyOtp({ token_hash, type }) sidesteps both: it's a single server-side call, no PKCE
// code_verifier or flow-type negotiation involved, and it writes the resulting session directly
// as cookies via the server client below — by the time the browser renders the `next` page, a
// real session already exists, so the page's own getSession()/onAuthStateChange checks just see
// it immediately.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/reset-password";

  if (token_hash && type) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          },
        },
      },
    );

    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Missing/invalid/expired/already-used link — send them somewhere that explains it rather than
  // silently landing on a page with no session and no explanation.
  return NextResponse.redirect(`${origin}/reset-password?error=invalid_link`);
}
