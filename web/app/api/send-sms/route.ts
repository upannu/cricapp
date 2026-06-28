import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { to, body, fromName } = await request.json();

  if (!to || !body) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const username = process.env.CLICKSEND_USERNAME;
  const apiKey = process.env.CLICKSEND_API_KEY;

  if (!username || !apiKey) {
    return NextResponse.json({ error: "SMS not configured." }, { status: 500 });
  }

  const credentials = Buffer.from(`${username}:${apiKey}`).toString("base64");

  // Normalise Australian mobile numbers to E.164 (+61...)
  let phone = to.replace(/\s+/g, "");
  if (phone.startsWith("04")) phone = "+61" + phone.slice(1);
  else if (phone.startsWith("4") && phone.length === 9) phone = "+61" + phone;
  else if (!phone.startsWith("+")) phone = "+" + phone;

  const payload = {
    messages: [
      {
        body,
        to: phone,
        from: (fromName ?? "PACEHQ").slice(0, 11),
      },
    ],
  };

  try {
    const res = await fetch("https://rest.clicksend.com/v3/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (data.response_code !== "SUCCESS") {
      const msg = data.response_msg ?? "ClickSend error";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const msgStatus = data.data?.messages?.[0]?.status;
    if (msgStatus && msgStatus !== "SUCCESS") {
      return NextResponse.json({ error: `Message status: ${msgStatus}` }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
