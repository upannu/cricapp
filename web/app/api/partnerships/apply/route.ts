import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { buildPartnershipApplicationEmailHtml, emailFrom } from "@/lib/email-templates";
import { displayPartnershipReference } from "@/lib/db";
import type { PartnershipOrgType } from "@/lib/types";

const ORG_TYPES: PartnershipOrgType[] = [
  "National Cricket Board", "State Cricket Association", "Regional Cricket Association",
  "District Cricket Association", "Academy Network", "Professional Cricket Organisation", "Other",
  // Short-form intake from /organisations/{academies,coaches,associations}/apply.
  "Academy", "Coach", "Cricket Association",
];

interface ApplyBody {
  organisationName?: string; organisationType?: string; country?: string;
  region?: string; website?: string;
  scalePlayers?: string; scaleCoaches?: string; scaleAcademies?: string; scaleRegions?: string;
  interests?: string[]; challenges?: string; currentSystems?: string[]; timeline?: string;
  contactFirstName?: string; contactLastName?: string; jobTitle?: string;
  email?: string; phone?: string; budgetRange?: string; additionalNotes?: string;
}

/**
 * Public "apply to partner" form on /partnerships/cricket-board/apply — no auth required. Unlike
 * /contact (email-only), this is a CRM lead: it writes a real partnership_applications row (plus
 * a `submitted` partnership_activity entry) before best-effort notifying staff, so the
 * application still exists even if the notification email fails to send.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as ApplyBody;

  const required: Array<[string, string | undefined]> = [
    ["organisationName", body.organisationName], ["organisationType", body.organisationType],
    ["country", body.country], ["contactFirstName", body.contactFirstName],
    ["contactLastName", body.contactLastName], ["jobTitle", body.jobTitle], ["email", body.email],
  ];
  const missing = required.find(([, v]) => !v?.trim());
  if (missing) return NextResponse.json({ error: `${missing[0]} is required.` }, { status: 400 });
  if (!ORG_TYPES.includes(body.organisationType as PartnershipOrgType)) {
    return NextResponse.json({ error: "Invalid organisation type." }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const now = new Date();
  const id = `prt_${now.getTime()}`;
  const reference = displayPartnershipReference(id, now);

  const { error: insertError } = await supabase.from("partnership_applications").insert({
    id,
    organisation_name: body.organisationName!.trim(),
    organisation_type: body.organisationType,
    country: body.country!.trim(),
    region: body.region?.trim() || null,
    website: body.website?.trim() || null,
    scale_players: body.scalePlayers || null,
    scale_coaches: body.scaleCoaches || null,
    scale_academies: body.scaleAcademies || null,
    scale_regions: body.scaleRegions || null,
    interests: body.interests ?? [],
    challenges: body.challenges?.trim() || null,
    current_systems: body.currentSystems ?? [],
    timeline: body.timeline || null,
    contact_first_name: body.contactFirstName!.trim(),
    contact_last_name: body.contactLastName!.trim(),
    job_title: body.jobTitle,
    email: body.email!.trim(),
    phone: body.phone?.trim() || null,
    budget_range: body.budgetRange || null,
    additional_notes: body.additionalNotes?.trim() || null,
    status: "submitted",
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  await supabase.from("partnership_activity").insert({
    id: `pact_${now.getTime()}`,
    application_id: id,
    kind: "submitted",
    body: "Application submitted via the public partnership form.",
    created_by: "system",
  });

  // Best-effort — the application is already saved; a failed notification shouldn't error the
  // applicant's submission or lose their lead.
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const adminEmail = process.env.PLATFORM_ADMIN_EMAIL;
  if (gmailUser && gmailPass && adminEmail) {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://crichq.com.au";
    await transporter.sendMail({
      from: emailFrom(gmailUser),
      to: adminEmail,
      replyTo: body.email,
      subject: `New CRIC HQ partnership interest (${body.organisationType}) — ${body.organisationName}`,
      text: [
        `${reference}`, ``,
        `Organisation: ${body.organisationName} (${body.organisationType})`,
        `Country: ${body.country}${body.region ? `, ${body.region}` : ""}`,
        `Contact: ${body.contactFirstName} ${body.contactLastName}, ${body.jobTitle} — ${body.email}`,
      ].join("\n"),
      html: buildPartnershipApplicationEmailHtml({
        appUrl, reference,
        organisationName: body.organisationName!, organisationType: body.organisationType!,
        country: body.country!, region: body.region,
        contactName: `${body.contactFirstName} ${body.contactLastName}`,
        jobTitle: body.jobTitle!, email: body.email!,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, id, reference });
}
