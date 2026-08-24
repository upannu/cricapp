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
  planName?: string;
  planHeading: string;
  planLines: string[];
  ctaLabel: string;
}): string {
  const { appUrl, heading, intro, planName, planHeading, planLines, ctaLabel } = opts;
  const planBlock = planLines.length > 0 ? `
    <div style="margin:24px 0 4px;padding:20px 22px;background:#F4FBF9;border:1px solid ${BRAND_GREEN};border-radius:12px;">
      <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_GREEN};">
        ${planName ? `${planHeading} — ${planName}` : planHeading}
      </p>
      <ul style="margin:0;padding-left:18px;color:#1A2E45;font-size:14px;line-height:1.8;">
        ${planLines.map((line) => `<li style="margin-bottom:2px;">${line}</li>`).join("\n        ")}
      </ul>
    </div>` : "";

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
      ${planBlock}
      <a href="${appUrl}/login" style="display:inline-block;margin-top:26px;padding:13px 30px;background:${BRAND_GREEN};color:#00110C;font-weight:700;text-decoration:none;border-radius:10px;font-size:14px;">
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
    planName: opts.planName,
    planHeading: "Your plan",
    planLines: opts.planLines,
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
    planName: opts.planName,
    planHeading: "What's included",
    planLines: opts.planLines,
    ctaLabel: "View in CRIC HQ",
  });
}
