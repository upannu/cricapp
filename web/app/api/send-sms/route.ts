import { NextResponse } from "next/server";
import { sendSms } from "@/lib/sms";

export async function POST(request: Request) {
  const { to, body, fromName } = await request.json();

  if (!to || !body) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const result = await sendSms(to, body, fromName ?? "CRIC HQ");
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? "Could not send SMS." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
