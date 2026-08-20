/** Sends an SMS via ClickSend. Returns { success: false } (never throws) if `to` is empty, so
 * call sites can call this unconditionally without an `if (phone)` guard. */
export async function sendSms(
  to: string | null | undefined,
  body: string,
  fromName = "CRIC HQ",
): Promise<{ success: boolean; error?: string }> {
  if (!to) return { success: false, error: "No phone number." };

  const username = process.env.CLICKSEND_USERNAME;
  const apiKey = process.env.CLICKSEND_API_KEY;
  if (!username || !apiKey) return { success: false, error: "SMS not configured." };

  const credentials = Buffer.from(`${username}:${apiKey}`).toString("base64");

  // Normalise Australian mobile numbers to E.164 (+61...)
  let phone = to.replace(/\s+/g, "");
  if (phone.startsWith("04")) phone = "+61" + phone.slice(1);
  else if (phone.startsWith("4") && phone.length === 9) phone = "+61" + phone;
  else if (!phone.startsWith("+")) phone = "+" + phone;

  const payload = {
    messages: [
      { body, to: phone, from: fromName.slice(0, 11) },
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
      return { success: false, error: data.response_msg ?? "ClickSend error" };
    }

    const msgStatus = data.data?.messages?.[0]?.status;
    if (msgStatus && msgStatus !== "SUCCESS") {
      return { success: false, error: `Message status: ${msgStatus}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as { message?: string })?.message ?? String(err) };
  }
}
