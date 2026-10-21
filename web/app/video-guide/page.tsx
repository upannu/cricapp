import { LegalPageShell } from "@/components/LegalPageShell";

export const metadata = { title: "Filming Guide — CRIC HQ" };

const ANGLE_CARDS = [
  {
    icon: "⬆", label: "Front", position: "Behind the umpire, facing down the pitch · 8–10m away.",
    why: "The only angle that shows the ball's flight down the pitch — this is what drives ball speed and pitch-length measurement.",
  },
  {
    icon: "➡", label: "Side", position: "Square on to the crease, off-stump side · 5–7m away.",
    why: "The single most important angle. It shows the joint angles (knee brace, trunk lean, arm path) that every biomechanics metric is built from — never skip this one if you can only film one.",
  },
  {
    icon: "⬇", label: "Back", position: "Behind the bowler, facing the run-up · 3–4m away.",
    why: "Supplementary — useful context, but only used if the side angle is missing.",
  },
];

/** Public filming/upload guide for the AI report pipeline — linked from both NewSessionForm (coach
 * flow) and PortalLogSessionClient (player self-log flow), and kept at a plain public URL so it can
 * also be shared with a parent before they film, without needing to sign in first. Every number and
 * claim here is pulled directly from the real thresholds in lib/video-quality.ts, lib/transcode.ts,
 * lib/session-video-upload.ts and lib/report-pipeline.ts — see that research, not invented copy. */
export default function VideoGuidePage() {
  return (
    <LegalPageShell title="Filming Guide">
      <p>
        Every number in an AI report — ball speed, front knee angle, injury risk — is measured
        directly from your video, frame by frame. There&apos;s no guessing involved, which also
        means the video you film is the single biggest factor in how accurate (and useful) the
        report turns out to be. This page covers exactly what to film and how to upload it.
      </p>

      <Section title="The 3 Camera Angles">
        <p className="mb-4">
          You can upload 1–3 angles per delivery. All three give the fullest analysis, but if
          you&apos;re short on time or a second phone, film the <strong className="text-white">side</strong>{" "}
          angle — it&apos;s the one every biomechanics metric depends on.
        </p>
        <div className="grid sm:grid-cols-3 gap-4 not-prose">
          {ANGLE_CARDS.map((a) => (
            <div key={a.label} className="bg-hp-surface border border-white/10 p-4">
              <div className="text-2xl mb-2">{a.icon}</div>
              <p className="text-white font-bold text-sm mb-1">{a.label}</p>
              <p className="text-hp-paper/72 text-xs mb-2">{a.position}</p>
              <p className="text-hp-paper/55 text-xs">{a.why}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="What to Capture">
        <p>
          Keep the bowler fully in frame and unobstructed for the whole delivery stride — from
          the back foot landing through to the end of the follow-through. The run-up doesn&apos;t
          need to be in shot. One delivery per clip is plenty; the analysis only looks at roughly
          the first 10 seconds of action, so there&apos;s no benefit to filming longer.
        </p>
      </Section>

      <Section title="Lighting & Framing">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Film with good, even lighting — avoid filming into the sun or a bright background that silhouettes the bowler.</li>
          <li>Nothing should block the bowler mid-delivery (teammates, equipment, shadows).</li>
          <li>Hold the phone steady — braced against something or on a tripod/stand if you have one.</li>
        </ul>
      </Section>

      <Section title="Quality Targets">
        <p>
          Aim for 1080p at 60fps. Lower-quality clips — including footage shared via WhatsApp or
          similar apps, which tend to compress video aggressively — still upload and still get
          analyzed; you&apos;ll just see a quality warning that the report may be less accurate.
          Any phone format works (including HEVC/.mov from an iPhone) — every clip is
          automatically converted to a standard format in your browser before it uploads.
        </p>
      </Section>

      <Section title="Uploading">
        <p>
          Keep each angle&apos;s clip under about 50MB after conversion — trim to just the one
          delivery if a clip is running large. You don&apos;t need to convert or compress
          anything yourself; that happens automatically the moment you select the file.
        </p>
      </Section>

      <Section title="If a Report Fails">
        <p>
          The one message that means the video itself needs a reshoot is:{" "}
          <em className="text-white/90">&ldquo;Couldn&apos;t confidently detect a bowler in this
          clip.&rdquo;</em> That almost always means the clip was too dark, too blurry, too short,
          or had the bowler blocked or out of frame for part of the delivery. Refilm with clearer
          lighting and a continuous, unobstructed side-on view and it&apos;ll go through.
        </p>
      </Section>

      <Section title="Quick Checklist">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Side angle filmed, 5–7m away, square on to the crease</li>
          <li>Whole delivery stride in frame — back-foot contact through follow-through</li>
          <li>Good lighting, nothing blocking the view</li>
          <li>Phone held steady</li>
          <li>Clip trimmed to roughly one delivery</li>
        </ul>
      </Section>
    </LegalPageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-2">{title}</h2>
      {children}
    </div>
  );
}
