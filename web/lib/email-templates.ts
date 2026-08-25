// Shared HTML email template helpers. Inline styles only — email clients don't reliably support
// external/embedded CSS, and a light background is used deliberately since CRIC HQ's own dark
// theme renders inconsistently (or gets auto-inverted) across mail clients. The logo is loaded
// from the live domain (appUrl) rather than embedded — most mail clients load remote images fine,
// and inlining a base64 logo into every send bloats the message for no real benefit here.

const BRAND_GREEN = "#00D4AA";
const INK = "#0B1220";
const MUTED = "#5B6572";

function shell(opts: {
  appUrl: string;
  heading: string;
  intro: string;
  contentHtml?: string;
  ctaLabel: string;
  ctaHref?: string;
}): string {
  const { appUrl, heading, intro, contentHtml, ctaLabel, ctaHref } = opts;
  return `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:540px;margin:0 auto;background:#F6F8FA;padding:36px 20px;">
  <div style="text-align:center;margin-bottom:28px;">
    <img src="${appUrl}/crichq_logo.jpeg" width="56" height="56" alt="CRIC HQ" style="width:56px;height:56px;border-radius:50%;background:#ffffff;border:1px solid #E5E9EF;display:inline-block;object-fit:contain;padding:6px;" />
    <div style="margin-top:10px;font-size:15px;font-weight:800;letter-spacing:0.14em;color:${INK};">CRIC HQ</div>
  </div>
  <div style="background:#ffffff;border:1px solid #E5E9EF;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(11,18,32,0.06);">
    <div style="height:4px;background:linear-gradient(90deg,${BRAND_GREEN},#00A886);"></div>
    <div style="padding:32px 28px;">
      <h1 style="margin:0 0 8px;font-size:21px;line-height:1.3;color:${INK};">${heading}</h1>
      <p style="margin:0;font-size:14px;line-height:1.6;color:${MUTED};">${intro}</p>
      ${contentHtml ?? ""}
      <a href="${ctaHref ?? `${appUrl}/login`}" style="display:inline-block;margin-top:26px;padding:13px 30px;background:${BRAND_GREEN};color:#00110C;font-weight:700;text-decoration:none;border-radius:10px;font-size:14px;">
        ${ctaLabel}
      </a>
    </div>
  </div>
  <p style="text-align:center;margin-top:22px;font-size:12px;color:#9AA5B1;">
    CRIC HQ — Fast Bowling Performance Platform<br />
    <a href="${appUrl}" style="color:#9AA5B1;">${appUrl.replace(/^https?:\/\//, "")}</a>
  </p>
</div>`;
}

/** The light-green bordered box used for "your plan" / "booking details" style call-outs —
 * shared chrome, different body content per email. */
function infoBox(heading: string, bodyHtml: string): string {
  return `
    <div style="margin:24px 0 4px;padding:20px 22px;background:#F4FBF9;border:1px solid ${BRAND_GREEN};border-radius:12px;">
      <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_GREEN};">
        ${heading}
      </p>
      ${bodyHtml}
    </div>`;
}

function planListHtml(planLines: string[]): string {
  return `<ul style="margin:0;padding-left:18px;color:#1A2E45;font-size:14px;line-height:1.8;">
        ${planLines.map((line) => `<li style="margin-bottom:2px;">${line}</li>`).join("\n        ")}
      </ul>`;
}

function detailRowsHtml(rows: Array<{ label: string; value: string }>): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;color:#1A2E45;">
        ${rows.map((r) => `<tr><td style="padding:4px 0;color:${MUTED};width:110px;">${r.label}</td><td style="padding:4px 0;font-weight:600;">${r.value}</td></tr>`).join("\n        ")}
      </table>`;
}

/** Escapes text pulled straight from a public form (contact message, name) before it's dropped
 * into an HTML email body — this content is untrusted user input, not our own copy. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildWelcomeEmailHtml(opts: {
  name: string;
  roleLabel: string;
  appUrl: string;
  planName?: string;
  planLines: string[];
}): string {
  return shell({
    appUrl: opts.appUrl,
    heading: `Welcome, ${opts.name}! 🏏`,
    intro: `Your CRIC HQ account has been approved as a <strong>${opts.roleLabel}</strong>.`,
    contentHtml: opts.planLines.length > 0
      ? infoBox(opts.planName ? `Your plan — ${opts.planName}` : "Your plan", planListHtml(opts.planLines))
      : "",
    ctaLabel: "Sign in to get started",
  });
}

/** Same visual shell as the welcome email, reused for an on-demand "what's included in my plan
 * again?" resend — see api/send-plan-email/route.ts. */
export function buildPlanDetailsEmailHtml(opts: {
  name: string;
  academyName: string;
  appUrl: string;
  planName?: string;
  planLines: string[];
}): string {
  return shell({
    appUrl: opts.appUrl,
    heading: `Your plan details`,
    intro: `Hi ${opts.name}, here's a summary of ${opts.academyName}'s current CRIC HQ plan.`,
    contentHtml: opts.planLines.length > 0
      ? infoBox(opts.planName ? `What's included — ${opts.planName}` : "What's included", planListHtml(opts.planLines))
      : "",
    ctaLabel: "View in CRIC HQ",
  });
}

/** Shared by the booking-creation confirmation (to the player and, separately, to the coach) and
 * the pre-session reminder — same details box, different heading/intro/CTA supplied by the
 * caller (see api/bookings/notify-created and api/cron/booking-reminders). */
export function buildBookingEmailHtml(opts: {
  appUrl: string;
  heading: string;
  intro: string;
  rows: Array<{ label: string; value: string }>;
}): string {
  return shell({
    appUrl: opts.appUrl,
    heading: opts.heading,
    intro: opts.intro,
    contentHtml: infoBox("Booking details", detailRowsHtml(opts.rows)),
    ctaLabel: "View in CRIC HQ",
    ctaHref: `${opts.appUrl}/bookings`,
  });
}

/** The public /contact form notification sent to PLATFORM_ADMIN_EMAIL — see api/contact/route.ts. */
export function buildContactFormEmailHtml(opts: {
  appUrl: string;
  name: string;
  email: string;
  message: string;
}): string {
  const messageHtml = `<p style="margin:0;color:#1A2E45;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(opts.message)}</p>`;
  return shell({
    appUrl: opts.appUrl,
    heading: "New contact form submission",
    intro: `${escapeHtml(opts.name)} (${escapeHtml(opts.email)}) sent a message via the Contact page.`,
    contentHtml: infoBox("Message", messageHtml),
    ctaLabel: "Reply by email",
    ctaHref: `mailto:${opts.email}`,
  });
}
