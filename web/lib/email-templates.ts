// Shared HTML email template helpers. Inline styles only — email clients don't reliably support
// external/embedded CSS, and a light background is used deliberately since CRIC HQ's own dark
// theme renders inconsistently (or gets auto-inverted) across mail clients.

const BRAND_GREEN = "#00D4AA";
const INK = "#0B1220";

export function buildWelcomeEmailHtml(opts: {
  name: string;
  roleLabel: string;
  appUrl: string;
  planName?: string;
  planLines: string[];
}): string {
  const { name, roleLabel, appUrl, planName, planLines } = opts;
  const planBlock = planLines.length > 0 ? `
    <div style="margin:24px 0;padding:20px;background:#F4FBF9;border:1px solid ${BRAND_GREEN};border-radius:12px;">
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND_GREEN};">
        ${planName ? `Your plan — ${planName}` : "What's included"}
      </p>
      <ul style="margin:0;padding-left:18px;color:#1A2E45;font-size:14px;line-height:1.7;">
        ${planLines.map((line) => `<li>${line}</li>`).join("\n        ")}
      </ul>
    </div>` : "";

  return `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:${INK};">
  <div style="text-align:center;margin-bottom:24px;">
    <span style="font-size:20px;font-weight:800;letter-spacing:0.08em;color:${INK};">CRIC HQ</span>
  </div>
  <div style="background:#ffffff;border:1px solid #E5E9EF;border-radius:16px;padding:28px;">
    <h1 style="margin:0 0 4px;font-size:20px;color:${INK};">Welcome, ${name}! 🏏</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#5B6572;">
      Your CRIC HQ account has been approved as a <strong>${roleLabel}</strong>.
    </p>
    ${planBlock}
    <a href="${appUrl}/login" style="display:inline-block;margin-top:20px;padding:12px 28px;background:${BRAND_GREEN};color:#00110C;font-weight:700;text-decoration:none;border-radius:10px;font-size:14px;">
      Sign in to get started
    </a>
  </div>
  <p style="text-align:center;margin-top:20px;font-size:12px;color:#9AA5B1;">— CRIC HQ</p>
</div>`;
}
