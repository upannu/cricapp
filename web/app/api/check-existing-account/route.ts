import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { findAuthUserByEmail } from "@/lib/server-auth";

export async function POST(request: Request) {
  const { email } = await request.json();
  if (!email) return NextResponse.json({ error: "email required." }, { status: 400 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Only tells the caller whether *some* account exists for this email — no other details,
  // since this is called from the public signup form before any session exists.
  const { user, error } = await findAuthUserByEmail(supabase, String(email));
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ exists: !!user });
}
