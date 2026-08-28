import { createClient } from "@/lib/supabase";
import type {
  Player, Coach, Academy, Booking, Session, SessionPack, Message, Report,
  BowlingStyle, AgeGroup, BattingHand, PlayingLevel, GuardianConsent, PlanTier, ActionType,
  InjuryRisk, AcademyStage, BookingType, BookingStatus, MessageChannel,
  ReportBiomechanics, SkeletonImage, ReportDrill, BallTrackingResult, CameraCalibration,
  ActionPlan, ActionPlanPriority, ActionPlanStatus,
  SCWorkout, SCWorkoutType,
  VideoAnnotation, VoiceNote, Assessment, AssessmentCategory,
  Article, ArticleCategory, DailyTip, ArticleRead, PaymentStatus,
  Plan, EmailTemplate,
  GroupSession, AttendanceStatus, AttendanceRecord, Net,
  Referral, ReferralPayout, ReferredType, ReferralCommissionType, ReferralRevenueSource, ReferralStatus, ReferralPayoutStatus,
  PackFeeDue, PackFeeDueStatus, BookingFeeDue,
} from "@/lib/types";
import { STAGE_ORDER, XP_PER_ARTICLE, STAGE_COMPLETE_BONUS_XP, ALL_ARTICLES_BONUS_XP, ACADEMY_TOTAL_ARTICLES, TIP_STREAK_BONUS_XP, TIP_STREAK_TARGET_DAYS, currentUnlockedStage } from "@/lib/academy-content";
import { DEFAULT_CURRENCY, type Currency } from "@/lib/currency";

// ─── DB row types (snake_case from Postgres) ────────────────────────────────

export interface DbPlayer {
  id: string; name: string; email: string; phone: string;
  bowling_style: string; age_group: string; club: string;
  batting_hand?: string; playing_level?: string;
  height_cm?: number | null; weight_kg?: number | null;
  coach_id: string | null; guardian_consent_status: string;
  guardian_consent_confirmed_at?: string | null;
  guardian_consent_confirmed_by?: string | null;
  guardian_consent_confirmed_email?: string | null;
  added_date: string; sessions_count: number; last_active: string; xp: number;
  sub_plan: string; sub_start_date: string; sub_end_date: string;
  sub_sessions_used: number; sub_sessions_limit: number | null;
  stripe_customer_id?: string | null; stripe_subscription_id?: string | null;
  subscription_status?: string | null;
  library_stripe_subscription_id?: string | null; library_subscription_status?: string | null;
  assessment_credits?: number;
  bio_ball_speed_kmh: number; bio_front_knee_angle_deg: number;
  bio_action_type: string; bio_injury_risk: string; bio_last_session: string;
  acad_stage: string; acad_completion_percent: number;
  acad_total_sessions: number; acad_xp: number; acad_articles_read: number;
  tip_streak_count?: number; tip_best_streak?: number; tip_last_viewed_date?: string | null;
  login_disabled?: boolean; disabled_at?: string | null; disabled_reason?: string | null;
  currency?: string;
}

export interface DbCoach {
  id: string; name: string; email: string; phone: string;
  specialization: string; age_groups_focus: string[]; location: string;
  status: string; joined_date: string; certification_level: string;
  bio: string; academy_id: string | null;
  marketplace_visible: boolean;
  available?: boolean;
  stripe_connect_account_id?: string | null;
  stripe_connect_onboarded?: boolean;
  lat?: number | null;
  lng?: number | null;
  currency?: string;
}

export interface DbAcademy {
  id: string; name: string; description: string; location: string; phone?: string | null;
  player_ids: string[]; player_counts: Record<string, number>;
  coach_ids: string[]; head_coach_id: string;
  stage: string; coach_name: string; start_date: string; status: string;
  country?: string; currency?: string;
  session_fee_aud: number; session_type_fees: Record<string, number>;
  age_fees: Record<string, number>;
  stripe_customer_id?: string | null; stripe_subscription_id?: string | null;
  subscription_status?: string | null; plan_id?: string | null;
  access_expires_at?: string | null;
  payout_model?: string;
}

export interface DbBooking {
  id: string; player_id: string; coach_id: string; date: string;
  time: string; duration_mins: number; type: string; status: string;
  location: string; notes: string; fee_aud: number; pack_id?: string | null;
  net_id?: string | null;
  source?: string | null;
  payment_status?: string;
  paid_date?: string | null;
}

export interface DbNet {
  id: string; academy_id: string; name: string; dimensions: string;
}

export interface DbSession {
  id: string; player_id: string; date: string; type: string;
  notes: string;
  videos: Array<{
    angle: string; label: string; url?: string;
    width?: number; height?: number; durationSec?: number;
    fps?: number | null; transcoded?: boolean;
  }>;
  ball_speed_kmh: number | null; front_knee_angle_deg: number | null;
  xp_earned: number; booking_id?: string | null;
  rpe?: number | null;
}

export interface DbSessionPack {
  id: string; player_id: string; academy_id: string; coach_id?: string | null; session_type: string;
  purchase_date: string; total_sessions: number; sessions_used: number;
  session_credits: number; fee_per_session: number; status: string;
  payment_status: string; payment_due_date: string; paid_date?: string | null; agreed_days?: string[];
  /** Idempotency flags for the pack-reminders cron — each fires at most once per pack. Internal
   * bookkeeping only, not surfaced through dbToSessionPack/the client-facing SessionPack type. */
  reminder_7d_sent_at?: string | null;
  reminder_2d_sent_at?: string | null;
  reminder_due_sent_at?: string | null;
}

export interface DbReport {
  id: string; player_id: string; date: string; type: string;
  summary: string; speed_kmh: number | null; front_knee_angle_deg: number | null;
  tags: string[]; highlight: string | null; session_id?: string | null;
  session_date?: string | null;
  action_type?: string | null; injury_risk?: string | null;
  overall_score?: number | null; angle_used?: string | null;
  metrics?: ReportBiomechanics | null;
  skeleton_images?: SkeletonImage[] | null;
  drills?: ReportDrill[] | null;
  ball_tracking?: BallTrackingResult | null;
  review_status?: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

export interface DbCameraCalibration {
  id: string; academy_id: string; angle: string;
  point1_x: number; point1_y: number; point2_x: number; point2_y: number;
  reference_distance_m: number; frame_width: number; frame_height: number;
}

export interface DbMessage {
  id: string; player_id: string; from_name: string; date: string;
  channel: string; subject: string; body: string;
}

// ─── Mappers ────────────────────────────────────────────────────────────────

export function dbToPlayer(r: DbPlayer): Player {
  return {
    id: r.id, name: r.name, email: r.email, phone: r.phone,
    bowlingStyle: r.bowling_style as BowlingStyle,
    battingHand: (r.batting_hand ?? "Right Hand") as BattingHand,
    playingLevel: (r.playing_level ?? "Club") as PlayingLevel,
    heightCm: r.height_cm ?? null,
    weightKg: r.weight_kg ?? null,
    ageGroup: r.age_group as AgeGroup,
    club: r.club, coachId: r.coach_id ?? "",
    guardianConsentStatus: r.guardian_consent_status as GuardianConsent,
    guardianConsentConfirmedAt: r.guardian_consent_confirmed_at ?? undefined,
    guardianConsentConfirmedBy: r.guardian_consent_confirmed_by ?? undefined,
    guardianConsentConfirmedEmail: r.guardian_consent_confirmed_email ?? undefined,
    addedDate: r.added_date, sessionsCount: r.sessions_count,
    lastActive: r.last_active, xp: r.xp,
    tipStreakCount: r.tip_streak_count ?? 0, tipBestStreak: r.tip_best_streak ?? 0,
    libraryStripeSubscriptionId: r.library_stripe_subscription_id ?? undefined,
    librarySubscriptionStatus: r.library_subscription_status ?? null,
    assessmentCredits: r.assessment_credits ?? 0,
    loginDisabled: r.login_disabled ?? false,
    disabledAt: r.disabled_at ?? null,
    disabledReason: r.disabled_reason ?? null,
    currency: (r.currency as Currency | undefined) ?? DEFAULT_CURRENCY,
    subscription: {
      plan: r.sub_plan as PlanTier,
      startDate: r.sub_start_date, endDate: r.sub_end_date,
      sessionsUsed: r.sub_sessions_used, sessionsLimit: r.sub_sessions_limit,
      stripeCustomerId: r.stripe_customer_id ?? undefined,
      stripeSubscriptionId: r.stripe_subscription_id ?? undefined,
      subscriptionStatus: r.subscription_status ?? undefined,
    },
    biomechanics: {
      ballSpeedKmh: r.bio_ball_speed_kmh,
      frontKneeAngleDeg: r.bio_front_knee_angle_deg,
      actionType: r.bio_action_type as ActionType,
      injuryRisk: r.bio_injury_risk as InjuryRisk,
      lastSession: r.bio_last_session,
    },
    academy: {
      stage: r.acad_stage as AcademyStage,
      completionPercent: r.acad_completion_percent,
      totalSessions: r.acad_total_sessions,
      xp: r.acad_xp,
      articlesRead: r.acad_articles_read,
    },
  };
}

export function dbToCoach(r: DbCoach): Coach {
  return {
    id: r.id, name: r.name, email: r.email, phone: r.phone,
    specialization: r.specialization,
    ageGroupsFocus: r.age_groups_focus as AgeGroup[],
    location: r.location, status: r.status as "Active" | "Inactive",
    joinedDate: r.joined_date,
    certificationLevel: r.certification_level as Coach["certificationLevel"],
    bio: r.bio, academyId: r.academy_id ?? "",
    marketplaceVisible: r.marketplace_visible ?? false,
    available: r.available ?? true,
    stripeConnectAccountId: r.stripe_connect_account_id ?? undefined,
    stripeConnectOnboarded: r.stripe_connect_onboarded ?? false,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    currency: (r.currency as Currency | undefined) ?? DEFAULT_CURRENCY,
  };
}

export function dbToAcademy(r: DbAcademy): Academy {
  return {
    id: r.id, name: r.name, description: r.description, location: r.location,
    phone: r.phone ?? undefined,
    playerIds: r.player_ids ?? [],
    playerCounts: r.player_counts as Academy["playerCounts"],
    coachIds: (r.coach_ids ?? []) as string[],
    headCoachId: r.head_coach_id ?? "",
    stage: r.stage as AcademyStage,
    coachName: r.coach_name, startDate: r.start_date,
    status: r.status as "Active" | "Inactive",
    country: r.country ?? "AU",
    currency: (r.currency as Currency | undefined) ?? DEFAULT_CURRENCY,
    sessionFeeAud: r.session_fee_aud,
    sessionTypeFees: r.session_type_fees as Academy["sessionTypeFees"],
    ageFees: (r.age_fees ?? {}) as Academy["ageFees"],
    stripeCustomerId: r.stripe_customer_id ?? undefined,
    stripeSubscriptionId: r.stripe_subscription_id ?? undefined,
    subscriptionStatus: r.subscription_status ?? undefined,
    planId: r.plan_id ?? undefined,
    accessExpiresAt: r.access_expires_at ?? undefined,
    payoutModel: (r.payout_model as Academy["payoutModel"]) ?? "head_coach",
  };
}

export function dbToBooking(r: DbBooking): Booking {
  return {
    id: r.id, playerId: r.player_id, coachId: r.coach_id,
    date: r.date, time: r.time, durationMins: r.duration_mins,
    type: r.type as BookingType, status: r.status as BookingStatus,
    location: r.location, notes: r.notes, feeAud: r.fee_aud,
    packId: r.pack_id ?? undefined,
    netId: r.net_id ?? undefined,
    source: (r.source as Booking["source"]) ?? undefined,
    paymentStatus: (r.payment_status as PaymentStatus) ?? "Pending",
    paidDate: r.paid_date ?? undefined,
  };
}

export function dbToNet(r: DbNet): Net {
  return { id: r.id, academyId: r.academy_id, name: r.name, dimensions: r.dimensions };
}

export function dbToSession(r: DbSession): Session {
  return {
    id: r.id, playerId: r.player_id, date: r.date,
    type: r.type as Session["type"], notes: r.notes,
    videos: (r.videos ?? []).map((v) => ({ ...v, angle: v.angle as "front" | "side" | "back" })),
    ballSpeedKmh: r.ball_speed_kmh, frontKneeAngleDeg: r.front_knee_angle_deg,
    xpEarned: r.xp_earned,
    bookingId: r.booking_id ?? undefined,
    rpe: r.rpe ?? null,
  };
}

export function dbToSessionPack(r: DbSessionPack): SessionPack {
  return {
    id: r.id, playerId: r.player_id, academyId: r.academy_id,
    coachId: r.coach_id ?? undefined,
    sessionType: r.session_type as BookingType,
    purchaseDate: r.purchase_date, totalSessions: r.total_sessions,
    sessionsUsed: r.sessions_used, sessionCredits: r.session_credits,
    feePerSession: r.fee_per_session,
    status: r.status as "Active" | "Exhausted",
    paymentStatus: r.payment_status as SessionPack["paymentStatus"],
    paymentDueDate: r.payment_due_date,
    paidDate: r.paid_date ?? null,
    agreedDays: r.agreed_days ?? [],
  };
}

export function dbToReport(r: DbReport): Report {
  return {
    id: r.id, playerId: r.player_id, date: r.date,
    type: r.type as Report["type"], summary: r.summary,
    speedKmh: r.speed_kmh, frontKneeAngleDeg: r.front_knee_angle_deg,
    tags: r.tags ?? [], highlight: r.highlight ?? undefined,
    sessionId: r.session_id ?? undefined,
    sessionDate: r.session_date ?? undefined,
    actionType: (r.action_type as ActionType) ?? undefined,
    injuryRisk: (r.injury_risk as InjuryRisk) ?? undefined,
    overallScore: r.overall_score ?? undefined,
    angleUsed: (r.angle_used as Report["angleUsed"]) ?? undefined,
    metrics: r.metrics ?? undefined,
    skeletonImages: r.skeleton_images ?? undefined,
    drills: r.drills ?? undefined,
    ballTracking: r.ball_tracking ?? undefined,
    reviewStatus: (r.review_status as Report["reviewStatus"]) ?? "not_reviewed",
    reviewedAt: r.reviewed_at ?? undefined,
    reviewedBy: r.reviewed_by ?? undefined,
  };
}

export function dbToCameraCalibration(r: DbCameraCalibration): CameraCalibration {
  return {
    id: r.id, academyId: r.academy_id, angle: r.angle as CameraCalibration["angle"],
    point1: { x: r.point1_x, y: r.point1_y },
    point2: { x: r.point2_x, y: r.point2_y },
    referenceDistanceM: r.reference_distance_m,
    frameWidth: r.frame_width, frameHeight: r.frame_height,
  };
}

export function dbToMessage(r: DbMessage): Message {
  return {
    id: r.id, playerId: r.player_id, fromName: r.from_name,
    date: r.date, channel: r.channel as MessageChannel,
    subject: r.subject, body: r.body,
  };
}

// ─── Query helpers ───────────────────────────────────────────────────────────

export async function fetchPlayers(coachId?: string, academyId?: string): Promise<Player[]> {
  const sb = createClient();
  // Players don't carry an academy_id column — an academy's roster lives as a player_ids
  // array on the academy row instead, so scoping by academy needs that lookup first.
  if (academyId) {
    const { data: academy, error: academyError } = await sb.from("academies").select("player_ids").eq("id", academyId).single();
    if (academyError) throw academyError;
    const playerIds = academy?.player_ids ?? [];
    if (playerIds.length === 0) return [];
    const { data, error } = await sb.from("players").select("*").in("id", playerIds).order("name");
    if (error) throw error;
    return (data as DbPlayer[]).map(dbToPlayer);
  }
  let q = sb.from("players").select("*").order("name");
  if (coachId) q = q.eq("coach_id", coachId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as DbPlayer[]).map(dbToPlayer);
}

export async function reassignCoachPlayers(fromCoachId: string, toCoachId: string | null): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("players").update({ coach_id: toCoachId }).eq("coach_id", fromCoachId);
  if (error) throw error;
}

export async function fetchPlayer(id: string): Promise<Player | null> {
  const sb = createClient();
  const { data } = await sb.from("players").select("*").eq("id", id).single();
  return data ? dbToPlayer(data as DbPlayer) : null;
}

export async function fetchPlayerByEmail(email: string): Promise<Player | null> {
  const sb = createClient();
  const { data } = await sb.from("players").select("*").ilike("email", email).maybeSingle();
  return data ? dbToPlayer(data as DbPlayer) : null;
}

export async function updatePlayer(id: string, edits: Partial<DbPlayer>): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("players").update(edits).eq("id", id);
  if (error) throw error;
}

/**
 * Was never actually happening — a session's xpEarned was inserted onto the session row but never
 * added to the player's running total or their monthly session count.
 *
 * `packId`: pass this when the session draws down a prepaid session pack. A pack session doesn't
 * also count against the subscription's own monthly quota — the academy already sold and collected
 * for it, so charging it against the Free-plan cap too would double-charge the player for one session.
 */
export async function recordSessionCompletion(playerId: string, xpEarned: number, packId?: string): Promise<void> {
  const sb = createClient();
  const { data, error: fetchError } = await sb
    .from("players")
    .select("xp, sessions_count, sub_sessions_used")
    .eq("id", playerId)
    .single();
  if (fetchError) throw fetchError;
  const { error } = await sb
    .from("players")
    .update({
      xp: (data.xp ?? 0) + xpEarned,
      sessions_count: (data.sessions_count ?? 0) + 1,
      ...(packId ? {} : { sub_sessions_used: (data.sub_sessions_used ?? 0) + 1 }),
    })
    .eq("id", playerId);
  if (error) throw error;

  if (packId) {
    const { data: pack, error: packError } = await sb.from("session_packs").select("sessions_used").eq("id", packId).single();
    if (!packError && pack) {
      await sb.from("session_packs").update({ sessions_used: pack.sessions_used + 1 }).eq("id", packId);
    }
  }
}

export async function insertPlayer(p: DbPlayer): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("players").insert(p);
  if (error) throw error;
}

/** Batched insert for CSV import — one round trip instead of N. */
export async function insertPlayers(rows: DbPlayer[]): Promise<void> {
  if (rows.length === 0) return;
  const sb = createClient();
  const { error } = await sb.from("players").insert(rows);
  if (error) throw error;
}

export async function fetchCoaches(academyId?: string): Promise<Coach[]> {
  const sb = createClient();
  let q = sb.from("coaches").select("*").order("name");
  if (academyId) q = q.eq("academy_id", academyId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as DbCoach[]).map(dbToCoach);
}

export async function fetchAcademies(): Promise<Academy[]> {
  const sb = createClient();
  const { data, error } = await sb.from("academies").select("*").order("name");
  if (error) throw error;
  return (data as DbAcademy[]).map(dbToAcademy);
}

export async function fetchAcademy(id: string): Promise<Academy | null> {
  const sb = createClient();
  const { data } = await sb.from("academies").select("*").eq("id", id).maybeSingle();
  return data ? dbToAcademy(data as DbAcademy) : null;
}

export async function updateAcademy(id: string, edits: Partial<DbAcademy>): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("academies").update(edits).eq("id", id);
  if (error) throw error;
}

export async function upsertCoach(c: Partial<DbCoach> & { id: string }): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("coaches").upsert(c);
  if (error) throw error;
}

// Coaches created inline while editing an academy are inserted with academy_id: null (only
// academies.coach_ids references them at that point) - call this after saving the academy so
// coaches.academy_id stays in sync with the array, matching what fetchCoaches(academyId) and
// the RLS policies scope by.
export async function setCoachesAcademy(academyId: string, coachIds: string[]): Promise<void> {
  if (coachIds.length === 0) return;
  const sb = createClient();
  const { error } = await sb.from("coaches").update({ academy_id: academyId }).in("id", coachIds);
  if (error) throw error;
}

// Before deleting, strip this coach from every academy's coach_ids array that references them —
// not just their own academy_id column — so a deleted coach never lingers as a dangling roster
// entry. The caller is responsible for reassigning any academy's head_coach_id away from this
// coach first (the DB trigger blocks the delete otherwise); this only cleans up coach_ids.
export async function deleteCoach(id: string): Promise<void> {
  const sb = createClient();
  // coach_ids is jsonb (not a native Postgres array) — .contains() needs the value as a JSON
  // string here, not a raw JS array, or PostgREST fails with "invalid input syntax for type json".
  const { data: referencingAcademies } = await sb
    .from("academies")
    .select("id, coach_ids")
    .contains("coach_ids", JSON.stringify([id]));
  for (const a of (referencingAcademies ?? []) as { id: string; coach_ids: string[] }[]) {
    const { error: updateError } = await sb
      .from("academies")
      .update({ coach_ids: (a.coach_ids ?? []).filter((cid) => cid !== id) })
      .eq("id", a.id);
    if (updateError) throw updateError;
  }
  const { error } = await sb.from("coaches").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertAcademy(a: Partial<DbAcademy> & { id: string }): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("academies").upsert(a);
  if (error) throw error;
}

// .upsert() always validates as if it were a fresh INSERT (even against an existing row), so a
// partial payload missing a NOT NULL column like `name` fails — use a real UPDATE for partial
// field changes on an academy that's already known to exist, e.g. reassigning its head coach.
export async function updateAcademyFields(id: string, fields: Partial<DbAcademy>): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("academies").update(fields).eq("id", id);
  if (error) throw error;
}

export async function deleteAcademy(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("academies").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchNets(academyId?: string): Promise<Net[]> {
  const sb = createClient();
  let q = sb.from("nets").select("*").order("name");
  if (academyId) q = q.eq("academy_id", academyId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as DbNet[]).map(dbToNet);
}

export async function upsertNet(n: Partial<DbNet> & { id: string }): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("nets").upsert(n);
  if (error) throw error;
}

export async function deleteNet(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("nets").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchBookings(coachId?: string, playerId?: string, playerIds?: string[]): Promise<Booking[]> {
  if (playerIds && playerIds.length === 0) return [];
  const sb = createClient();
  let q = sb.from("bookings").select("*").order("date", { ascending: false });
  if (coachId) q = q.eq("coach_id", coachId);
  if (playerId) q = q.eq("player_id", playerId);
  if (playerIds && playerIds.length > 0) q = q.in("player_id", playerIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data as DbBooking[]).map(dbToBooking);
}

export async function upsertBooking(b: Partial<DbBooking> & { id: string }): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("bookings").upsert(b);
  if (error) throw error;
}

export async function markBookingPaid(id: string, paidDate: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("bookings").update({ payment_status: "Paid", paid_date: paidDate }).eq("id", id);
  if (error) throw error;
}

export async function updateBookingStatus(id: string, status: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("bookings").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteBooking(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("bookings").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchSessions(coachName?: string, playerIds?: string[]): Promise<Session[]> {
  // An empty array means "scoped to zero players" (e.g. a coach with no players assigned) and
  // must return no sessions — distinct from `undefined`, which means no scoping was requested.
  // `playerIds?.length` alone can't tell these apart, since an empty array's length is also falsy.
  if (playerIds && playerIds.length === 0) return [];
  const sb = createClient();
  let q = sb.from("sessions").select("*").order("date", { ascending: false });
  if (playerIds && playerIds.length > 0) q = q.in("player_id", playerIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data as DbSession[]).map(dbToSession);
}

export async function insertSession(s: DbSession): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("sessions").insert(s);
  if (error) throw error;
}

export async function updateSessionRpe(id: string, rpe: number | null): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("sessions").update({ rpe }).eq("id", id);
  if (error) throw error;
}

export async function fetchSessionPacks(playerIds?: string[]): Promise<SessionPack[]> {
  const sb = createClient();
  let q = sb.from("session_packs").select("*").order("purchase_date", { ascending: false });
  if (playerIds?.length) q = q.in("player_id", playerIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data as DbSessionPack[]).map(dbToSessionPack);
}

export async function upsertSessionPack(pk: Partial<DbSessionPack> & { id: string }): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("session_packs").upsert(pk);
  if (error) throw error;
}

export async function insertSessionPacks(rows: DbSessionPack[]): Promise<void> {
  if (rows.length === 0) return;
  const sb = createClient();
  const { error } = await sb.from("session_packs").insert(rows);
  if (error) throw error;
}

export async function updatePackPaymentStatus(id: string, paymentStatus: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("session_packs").update({ payment_status: paymentStatus }).eq("id", id);
  if (error) throw error;
}

export async function updatePackAgreedDays(id: string, agreedDays: string[]): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("session_packs").update({ agreed_days: agreedDays }).eq("id", id);
  if (error) throw error;
}

export async function markPackPaid(id: string, paidDate: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("session_packs").update({ payment_status: "Paid", paid_date: paidDate }).eq("id", id);
  if (error) throw error;
}

// ─── Group sessions & attendance ────────────────────────────────────────────

export interface DbGroupSession {
  id: string; academy_id: string; coach_id: string; name: string;
  session_type: string; day_of_week: number; time: string;
  duration_mins: number; location: string | null; active: boolean;
}

export function dbToGroupSession(r: DbGroupSession, playerIds: string[]): GroupSession {
  return {
    id: r.id, academyId: r.academy_id, coachId: r.coach_id, name: r.name,
    sessionType: r.session_type as BookingType, dayOfWeek: r.day_of_week,
    time: r.time, durationMins: r.duration_mins, location: r.location ?? "",
    active: r.active, playerIds,
  };
}

export async function fetchGroupSessions(academyId?: string, coachId?: string): Promise<GroupSession[]> {
  const sb = createClient();
  let q = sb.from("group_sessions").select("*").order("name");
  if (academyId) q = q.eq("academy_id", academyId);
  if (coachId) q = q.eq("coach_id", coachId);
  const { data, error } = await q;
  if (error) throw error;
  const sessions = data as DbGroupSession[];
  if (sessions.length === 0) return [];

  const { data: rosterRows, error: rosterError } = await sb
    .from("group_session_players")
    .select("group_session_id, player_id")
    .in("group_session_id", sessions.map((s) => s.id));
  if (rosterError) throw rosterError;
  const rosterBySession: Record<string, string[]> = {};
  for (const row of (rosterRows ?? []) as { group_session_id: string; player_id: string }[]) {
    (rosterBySession[row.group_session_id] ??= []).push(row.player_id);
  }
  return sessions.map((s) => dbToGroupSession(s, rosterBySession[s.id] ?? []));
}

export async function upsertGroupSession(g: Partial<DbGroupSession> & { id: string }): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("group_sessions").upsert(g);
  if (error) throw error;
}

export async function setGroupSessionRoster(groupSessionId: string, playerIds: string[]): Promise<void> {
  const sb = createClient();
  const { error: delError } = await sb.from("group_session_players").delete().eq("group_session_id", groupSessionId);
  if (delError) throw delError;
  if (playerIds.length === 0) return;
  const rows = playerIds.map((playerId) => ({
    id: `gsp_${groupSessionId}_${playerId}`, group_session_id: groupSessionId, player_id: playerId,
  }));
  const { error: insError } = await sb.from("group_session_players").insert(rows);
  if (insError) throw insError;
}

export interface DbAttendanceRecord {
  id: string; occurrence_id: string; player_id: string; status: string;
  pack_id: string | null; recorded_at?: string;
}

export function dbToAttendanceRecord(r: DbAttendanceRecord): AttendanceRecord {
  return {
    id: r.id, occurrenceId: r.occurrence_id, playerId: r.player_id,
    status: r.status as AttendanceStatus, packId: r.pack_id, recordedAt: r.recorded_at ?? "",
  };
}

export async function fetchAttendanceForDate(groupSessionId: string, date: string): Promise<AttendanceRecord[]> {
  const sb = createClient();
  const { data: occ } = await sb.from("group_session_occurrences").select("id")
    .eq("group_session_id", groupSessionId).eq("date", date).maybeSingle();
  if (!occ) return [];
  const { data, error } = await sb.from("attendance_records").select("*").eq("occurrence_id", occ.id);
  if (error) throw error;
  return (data as DbAttendanceRecord[]).map(dbToAttendanceRecord);
}

export async function fetchPastOccurrences(groupSessionId: string): Promise<{ id: string; date: string }[]> {
  const sb = createClient();
  const { data, error } = await sb.from("group_session_occurrences").select("id, date")
    .eq("group_session_id", groupSessionId).order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as { id: string; date: string }[];
}

/**
 * Records attendance for one occurrence date of a recurring group session. The player's pack pays
 * for the agreed weekly slot whether they show up or not, so the FIRST time an occurrence is
 * recorded for a player — Present or Absent — it draws down one session from their own active
 * SessionPack (matching session_type + academy) if they have one. Toggling between Present and
 * Absent on an already-recorded occurrence doesn't re-consume or refund a session; a coach who
 * wants to excuse an absence uses the separate "Credit a Session" action instead (see
 * SessionPacksClient's CreditButton), which is subject to its own expiry window.
 */
export async function saveAttendance(
  groupSessionId: string,
  date: string,
  sessionType: string,
  academyId: string,
  records: { playerId: string; status: AttendanceStatus }[],
): Promise<void> {
  const sb = createClient();

  let occurrenceId: string;
  const { data: existingOcc } = await sb.from("group_session_occurrences").select("id")
    .eq("group_session_id", groupSessionId).eq("date", date).maybeSingle();
  if (existingOcc) {
    occurrenceId = existingOcc.id;
  } else {
    occurrenceId = `gso_${groupSessionId}_${date}`;
    const { error } = await sb.from("group_session_occurrences").insert({ id: occurrenceId, group_session_id: groupSessionId, date });
    if (error) throw error;
  }

  const { data: existingRecords } = await sb.from("attendance_records").select("*").eq("occurrence_id", occurrenceId);
  const existingByPlayer: Record<string, DbAttendanceRecord> = {};
  for (const r of (existingRecords ?? []) as DbAttendanceRecord[]) existingByPlayer[r.player_id] = r;

  for (const rec of records) {
    const existing = existingByPlayer[rec.playerId];
    let packId: string | null = existing?.pack_id ?? null;

    if (!existing) {
      // First time this occurrence is recorded for this player — the agreed slot is booked
      // either way, so it draws down a session regardless of Present vs. Absent.
      const { data: pack } = await sb.from("session_packs")
        .select("id, sessions_used, total_sessions")
        .eq("player_id", rec.playerId).eq("session_type", sessionType).eq("academy_id", academyId)
        .eq("status", "Active").maybeSingle();
      packId = pack && pack.sessions_used < pack.total_sessions ? pack.id : null;
      if (packId) await sb.from("session_packs").update({ sessions_used: pack!.sessions_used + 1 }).eq("id", packId);
    }
    // Toggling Present <-> Absent on an already-recorded occurrence leaves packId (and the
    // consumed session) untouched — both statuses consume the same slot now.

    const id = existing?.id ?? `att_${occurrenceId}_${rec.playerId}`;
    const { error } = await sb.from("attendance_records").upsert({
      id, occurrence_id: occurrenceId, player_id: rec.playerId, status: rec.status, pack_id: packId,
    });
    if (error) throw error;
  }
}

export async function fetchMessages(playerId: string): Promise<Message[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("messages")
    .select("*")
    .eq("player_id", playerId)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data as DbMessage[]).map(dbToMessage);
}

export async function insertMessage(msg: Omit<DbMessage, "id">): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("messages").insert(msg);
  if (error) throw error;
}

export async function fetchReports(playerId?: string, playerIds?: string[]): Promise<Report[]> {
  if (playerIds && playerIds.length === 0) return [];
  const sb = createClient();
  let q = sb.from("reports").select("*").order("date", { ascending: false });
  if (playerId) q = q.eq("player_id", playerId);
  if (playerIds && playerIds.length > 0) q = q.in("player_id", playerIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data as DbReport[]).map(dbToReport);
}

export async function fetchCameraCalibration(academyId: string, angle: string): Promise<CameraCalibration | null> {
  const sb = createClient();
  const { data, error } = await sb
    .from("camera_calibrations")
    .select("*")
    .eq("academy_id", academyId)
    .eq("angle", angle)
    .maybeSingle();
  if (error) throw error;
  return data ? dbToCameraCalibration(data as DbCameraCalibration) : null;
}

export async function upsertCameraCalibration(c: DbCameraCalibration): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("camera_calibrations").upsert(c, { onConflict: "academy_id,angle" });
  if (error) throw error;
}

export async function insertReport(r: Omit<DbReport, "id"> & { id: string }): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("reports").insert(r);
  if (error) throw error;
}

// ─── Action plans ───────────────────────────────────────────────────────────

export interface DbActionPlan {
  id: string; player_id: string; title: string; priority: string; status: string;
  due_date: string | null; drills: string[]; notes: string; created_at?: string;
}

export function dbToActionPlan(r: DbActionPlan): ActionPlan {
  return {
    id: r.id, playerId: r.player_id, title: r.title,
    priority: r.priority as ActionPlanPriority, status: r.status as ActionPlanStatus,
    dueDate: r.due_date ?? "", drills: r.drills ?? [], notes: r.notes ?? "",
    createdAt: r.created_at,
  };
}

export async function fetchActionPlans(playerId: string): Promise<ActionPlan[]> {
  const sb = createClient();
  const { data, error } = await sb.from("action_plans").select("*").eq("player_id", playerId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbActionPlan[]).map(dbToActionPlan);
}

export async function upsertActionPlan(p: DbActionPlan): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("action_plans").upsert(p);
  if (error) throw error;
}

export async function deleteActionPlan(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("action_plans").delete().eq("id", id);
  if (error) throw error;
}

// ─── S&C workouts ────────────────────────────────────────────────────────────

export interface DbSCWorkout {
  id: string; player_id: string; date: string; workout_type: string;
  duration_mins: number; rpe: number; notes: string; created_at?: string;
}

export function dbToSCWorkout(r: DbSCWorkout): SCWorkout {
  return {
    id: r.id, playerId: r.player_id, date: r.date,
    workoutType: r.workout_type as SCWorkoutType,
    durationMins: r.duration_mins, rpe: r.rpe, notes: r.notes ?? "",
    createdAt: r.created_at,
  };
}

export async function fetchSCWorkouts(playerId: string): Promise<SCWorkout[]> {
  const sb = createClient();
  const { data, error } = await sb.from("sc_workouts").select("*").eq("player_id", playerId).order("date", { ascending: false });
  if (error) throw error;
  return (data as DbSCWorkout[]).map(dbToSCWorkout);
}

export async function upsertSCWorkout(w: DbSCWorkout): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("sc_workouts").upsert(w);
  if (error) throw error;
}

export async function deleteSCWorkout(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("sc_workouts").delete().eq("id", id);
  if (error) throw error;
}

// ─── Video annotations ──────────────────────────────────────────────────────

export interface DbVideoAnnotation {
  id: string; session_id: string; player_id: string; angle: string;
  timestamp_sec: number; image_url: string; note: string; created_at?: string;
}

export function dbToVideoAnnotation(r: DbVideoAnnotation): VideoAnnotation {
  return {
    id: r.id, sessionId: r.session_id, playerId: r.player_id,
    angle: r.angle as VideoAnnotation["angle"], timestampSec: r.timestamp_sec,
    imageUrl: r.image_url, note: r.note ?? "", createdAt: r.created_at,
  };
}

export async function fetchVideoAnnotations(sessionId: string): Promise<VideoAnnotation[]> {
  const sb = createClient();
  const { data, error } = await sb.from("video_annotations").select("*").eq("session_id", sessionId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbVideoAnnotation[]).map(dbToVideoAnnotation);
}

export async function insertVideoAnnotation(a: DbVideoAnnotation): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("video_annotations").insert(a);
  if (error) throw error;
}

export async function deleteVideoAnnotation(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("video_annotations").delete().eq("id", id);
  if (error) throw error;
}

// ─── Voice notes ────────────────────────────────────────────────────────────

export interface DbVoiceNote {
  id: string; session_id?: string | null; player_id: string;
  audio_url: string; transcript: string; duration_sec: number | null; created_at?: string;
}

export function dbToVoiceNote(r: DbVoiceNote): VoiceNote {
  return {
    id: r.id, sessionId: r.session_id ?? undefined, playerId: r.player_id,
    audioUrl: r.audio_url, transcript: r.transcript ?? "", durationSec: r.duration_sec,
    createdAt: r.created_at,
  };
}

export async function fetchVoiceNotes(sessionId: string): Promise<VoiceNote[]> {
  const sb = createClient();
  const { data, error } = await sb.from("voice_notes").select("*").eq("session_id", sessionId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbVoiceNote[]).map(dbToVoiceNote);
}

export async function insertVoiceNote(n: DbVoiceNote): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("voice_notes").insert(n);
  if (error) throw error;
}

export async function updateVoiceNoteTranscript(id: string, transcript: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("voice_notes").update({ transcript }).eq("id", id);
  if (error) throw error;
}

export async function deleteVoiceNote(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("voice_notes").delete().eq("id", id);
  if (error) throw error;
}

// ─── Assessments ────────────────────────────────────────────────────────────

export interface DbAssessment {
  id: string; session_id?: string | null; player_id: string; coach_id?: string | null;
  ratings: Partial<Record<AssessmentCategory, number>>;
  comments: Partial<Record<AssessmentCategory, string>>;
  overall_recommendation: string; created_at?: string;
}

export function dbToAssessment(r: DbAssessment): Assessment {
  return {
    id: r.id, sessionId: r.session_id ?? undefined, playerId: r.player_id,
    coachId: r.coach_id ?? undefined, ratings: r.ratings ?? {}, comments: r.comments ?? {},
    overallRecommendation: r.overall_recommendation ?? "", createdAt: r.created_at,
  };
}

export async function fetchAssessments(playerId: string): Promise<Assessment[]> {
  const sb = createClient();
  const { data, error } = await sb.from("assessments").select("*").eq("player_id", playerId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbAssessment[]).map(dbToAssessment);
}

export async function insertAssessment(a: DbAssessment): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("assessments").insert(a);
  if (error) throw error;
}

// ─── Academy Content Library: articles, daily tips, reading progress ───────

export interface DbArticle {
  id: string; stage: string; order_in_stage: number; title: string;
  read_time_minutes: number; related_metric: string | null;
  key_takeaways: string[]; body_md: string; published: boolean;
  video_url?: string | null;
}

export function dbToArticle(r: DbArticle): Article {
  return {
    id: r.id, stage: r.stage as AcademyStage, orderInStage: r.order_in_stage,
    title: r.title, readTimeMinutes: r.read_time_minutes,
    relatedMetric: r.related_metric ?? undefined,
    keyTakeaways: r.key_takeaways ?? [], bodyMd: r.body_md, published: r.published,
    videoUrl: r.video_url ?? undefined,
  };
}

/** Admin CRUD — includes unpublished articles, unlike `fetchArticles` (the player-facing feed). */
export async function fetchAllArticlesForAdmin(): Promise<Article[]> {
  const sb = createClient();
  const { data, error } = await sb.from("articles").select("*").order("stage").order("order_in_stage");
  if (error) throw error;
  const articles = (data as DbArticle[]).map(dbToArticle);
  return articles.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.orderInStage - b.orderInStage);
}

export async function upsertArticle(a: DbArticle): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("articles").upsert(a);
  if (error) throw error;
}

export async function deleteArticle(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("articles").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchArticles(): Promise<Article[]> {
  const sb = createClient();
  const { data, error } = await sb.from("articles").select("*").eq("published", true).order("order_in_stage");
  if (error) throw error;
  const articles = (data as DbArticle[]).map(dbToArticle);
  return articles.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.orderInStage - b.orderInStage);
}

export async function fetchArticle(id: string): Promise<Article | null> {
  const sb = createClient();
  const { data } = await sb.from("articles").select("*").eq("id", id).maybeSingle();
  return data ? dbToArticle(data as DbArticle) : null;
}

export interface DbDailyTip {
  id: string; publish_date: string; category: string; body: string; related_article_id: string | null;
}

export function dbToDailyTip(r: DbDailyTip): DailyTip {
  return {
    id: r.id, publishDate: r.publish_date, category: r.category as ArticleCategory,
    body: r.body, relatedArticleId: r.related_article_id ?? undefined,
  };
}

/** Most recent tip published on or before today — falls back sensibly if no tip is dated exactly today. */
export async function fetchTodaysTip(): Promise<DailyTip | null> {
  const sb = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await sb
    .from("daily_tips")
    .select("*")
    .lte("publish_date", today)
    .order("publish_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? dbToDailyTip(data as DbDailyTip) : null;
}

export async function fetchTipArchive(limit = 30): Promise<DailyTip[]> {
  const sb = createClient();
  const { data, error } = await sb.from("daily_tips").select("*").order("publish_date", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data as DbDailyTip[]).map(dbToDailyTip);
}

export async function upsertDailyTip(t: DbDailyTip): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("daily_tips").upsert(t);
  if (error) throw error;
}

export async function deleteDailyTip(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("daily_tips").delete().eq("id", id);
  if (error) throw error;
}

export interface DbArticleRead {
  id: string; player_id: string; article_id: string; read_at: string;
}

export function dbToArticleRead(r: DbArticleRead): ArticleRead {
  return { id: r.id, playerId: r.player_id, articleId: r.article_id, readAt: r.read_at };
}

export async function fetchArticleReads(playerId: string): Promise<ArticleRead[]> {
  const sb = createClient();
  const { data, error } = await sb.from("article_reads").select("*").eq("player_id", playerId);
  if (error) throw error;
  return (data as DbArticleRead[]).map(dbToArticleRead);
}

/**
 * Marks an article read (idempotent — re-reading awards no extra XP) and applies every XP rule from the
 * doc's unlock table in one place: per-article XP by stage, the 500 XP stage-completion bonus, and the
 * 1000 XP all-29 bonus. Badges stay derived from `acad_articles_read`/`acad_xp` rather than a stored
 * award, consistent with `badges.ts` — nothing here needs to "remember" that a bonus was already paid,
 * because a duplicate read is rejected before any XP is calculated.
 */
export async function recordArticleRead(
  playerId: string,
  article: Article,
  allArticles: Article[]
): Promise<{ alreadyRead: boolean; xpAwarded: number }> {
  const sb = createClient();
  const readId = `${playerId}_${article.id}`;
  const { error: insertError } = await sb
    .from("article_reads")
    .insert({ id: readId, player_id: playerId, article_id: article.id });
  if (insertError) {
    if (insertError.code === "23505") return { alreadyRead: true, xpAwarded: 0 };
    throw insertError;
  }

  const [{ data: playerRow, error: playerError }, { data: readRows, error: readsError }] = await Promise.all([
    sb.from("players").select("xp, acad_xp, acad_articles_read, sub_plan, library_subscription_status").eq("id", playerId).single(),
    sb.from("article_reads").select("article_id").eq("player_id", playerId),
  ]);
  if (playerError) throw playerError;
  if (readsError) throw readsError;

  const readIds = new Set((readRows as { article_id: string }[]).map((r) => r.article_id));
  const readCountByStage: Partial<Record<AcademyStage, number>> = {};
  const totalByStage: Partial<Record<AcademyStage, number>> = {};
  for (const a of allArticles) {
    totalByStage[a.stage] = (totalByStage[a.stage] ?? 0) + 1;
    if (readIds.has(a.id)) readCountByStage[a.stage] = (readCountByStage[a.stage] ?? 0) + 1;
  }

  let xpAwarded = XP_PER_ARTICLE[article.stage];
  const stageReadCount = readCountByStage[article.stage] ?? 0;
  const stageTotal = totalByStage[article.stage] ?? 0;
  if (stageTotal > 0 && stageReadCount === stageTotal) xpAwarded += STAGE_COMPLETE_BONUS_XP;
  if (readIds.size === ACADEMY_TOTAL_ARTICLES) xpAwarded += ALL_ARTICLES_BONUS_XP;

  const newArticlesRead = readIds.size;
  const hasLibraryAccess = playerRow.library_subscription_status === "active" || playerRow.library_subscription_status === "trialing";
  const newStage = currentUnlockedStage(playerRow.sub_plan as PlanTier, readCountByStage, hasLibraryAccess);

  const { error: updateError } = await sb
    .from("players")
    .update({
      xp: (playerRow.xp ?? 0) + xpAwarded,
      acad_xp: (playerRow.acad_xp ?? 0) + xpAwarded,
      acad_articles_read: newArticlesRead,
      acad_completion_percent: Math.round((newArticlesRead / ACADEMY_TOTAL_ARTICLES) * 100),
      acad_stage: newStage,
    })
    .eq("id", playerId);
  if (updateError) throw updateError;

  return { alreadyRead: false, xpAwarded };
}

/** Increments (or resets) a player's daily-tip streak, once per calendar day, and pays the 7-day streak bonus. */
export async function recordTipView(playerId: string): Promise<{ streak: number; bonusAwarded: boolean }> {
  const sb = createClient();
  const { data, error: fetchError } = await sb
    .from("players")
    .select("xp, tip_streak_count, tip_best_streak, tip_last_viewed_date")
    .eq("id", playerId)
    .single();
  if (fetchError) throw fetchError;

  const today = new Date().toISOString().slice(0, 10);
  if (data.tip_last_viewed_date === today) {
    return { streak: data.tip_streak_count ?? 0, bonusAwarded: false };
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newStreak = data.tip_last_viewed_date === yesterday ? (data.tip_streak_count ?? 0) + 1 : 1;
  const bonusAwarded = newStreak > 0 && newStreak % TIP_STREAK_TARGET_DAYS === 0;

  const { error: updateError } = await sb
    .from("players")
    .update({
      tip_streak_count: newStreak,
      tip_best_streak: Math.max(data.tip_best_streak ?? 0, newStreak),
      tip_last_viewed_date: today,
      xp: (data.xp ?? 0) + (bonusAwarded ? TIP_STREAK_BONUS_XP : 0),
    })
    .eq("id", playerId);
  if (updateError) throw updateError;

  return { streak: newStreak, bonusAwarded };
}

// ─── Welcome-email templates (one per role, edited at /admin/email-templates) ──────────────

export interface DbEmailTemplate {
  id: string; subject: string; heading: string; body: string;
}

export function dbToEmailTemplate(r: DbEmailTemplate): EmailTemplate {
  return { id: r.id as EmailTemplate["id"], subject: r.subject, heading: r.heading, body: r.body };
}

export async function fetchEmailTemplates(): Promise<EmailTemplate[]> {
  const sb = createClient();
  const { data, error } = await sb.from("email_templates").select("*").order("id");
  if (error) throw error;
  return (data as DbEmailTemplate[]).map(dbToEmailTemplate);
}

// ─── Plan catalog (Library, Individual Assessment, Academy/Club/Board licenses) ────────────

export interface DbPlan {
  id: string;
  slug: string;
  name: string;
  audience: string;
  billing_type: string;
  billing_interval: string | null;
  price_aud: number;
  prices_by_currency?: Record<string, number> | null;
  seat_cap: number | null;
  access_duration_months: number | null;
  included_notes: string | null;
  waives_session_fees?: boolean;
  platform_admin_only?: boolean;
  platform_fee_percent?: number;
  active: boolean;
  sort_order: number;
  sessions_per_month_limit?: number | null;
  chat_messages_per_day_limit?: number | null;
  ai_reports_enabled?: boolean;
  marketplace_enabled?: boolean;
  locked?: boolean;
}

export function dbToPlan(r: DbPlan): Plan {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    audience: r.audience as Plan["audience"],
    billingType: r.billing_type as Plan["billingType"],
    billingInterval: r.billing_interval as Plan["billingInterval"],
    priceAud: r.price_aud,
    pricesByCurrency: (r.prices_by_currency as Partial<Record<Currency, number>> | null) ?? {},
    seatCap: r.seat_cap,
    accessDurationMonths: r.access_duration_months,
    includedNotes: r.included_notes,
    waivesSessionFees: r.waives_session_fees ?? false,
    platformAdminOnly: r.platform_admin_only ?? false,
    platformFeePercent: r.platform_fee_percent ?? 10,
    active: r.active,
    sortOrder: r.sort_order,
    sessionsPerMonthLimit: r.sessions_per_month_limit ?? null,
    chatMessagesPerDayLimit: r.chat_messages_per_day_limit ?? null,
    aiReportsEnabled: r.ai_reports_enabled ?? true,
    marketplaceEnabled: r.marketplace_enabled ?? true,
    locked: r.locked ?? false,
  };
}

/** All plans, including inactive ones — for the admin catalog screen. */
export async function fetchAllPlans(): Promise<Plan[]> {
  const sb = createClient();
  const { data, error } = await sb.from("plans").select("*").order("sort_order");
  if (error) throw error;
  return (data as DbPlan[]).map(dbToPlan);
}

/** Only active plans — for player/academy-facing purchase screens. */
export async function fetchActivePlans(): Promise<Plan[]> {
  const sb = createClient();
  const { data, error } = await sb.from("plans").select("*").eq("active", true).order("sort_order");
  if (error) throw error;
  return (data as DbPlan[]).map(dbToPlan);
}

export async function fetchPlanBySlug(slug: string): Promise<Plan | null> {
  const sb = createClient();
  const { data } = await sb.from("plans").select("*").eq("slug", slug).maybeSingle();
  return data ? dbToPlan(data as DbPlan) : null;
}

// ─── Referrals ──────────────────────────────────────────────────────────────

export interface DbReferral {
  id: string; referrer_name: string; referrer_email?: string | null; referrer_phone?: string | null;
  referrer_payment_details?: string | null;
  referred_type: string;
  referred_academy_id?: string | null; referred_coach_id?: string | null; referred_player_id?: string | null;
  referred_name: string;
  commission_type: string;
  one_off_amount_aud?: number | null;
  ongoing_rate_percent?: number | null;
  ongoing_revenue_source?: string | null;
  ongoing_end_date?: string | null;
  status: string;
  notes?: string | null;
  created_at?: string;
  created_by: string;
}

export interface DbReferralPayout {
  id: string; referral_id: string; period_label?: string | null;
  amount_aud: number; status: string; paid_date?: string | null; paid_by?: string | null;
  created_at?: string;
}

export function dbToReferral(r: DbReferral): Referral {
  return {
    id: r.id, referrerName: r.referrer_name, referrerEmail: r.referrer_email ?? undefined,
    referrerPhone: r.referrer_phone ?? undefined, referrerPaymentDetails: r.referrer_payment_details ?? undefined,
    referredType: r.referred_type as ReferredType,
    referredAcademyId: r.referred_academy_id ?? undefined, referredCoachId: r.referred_coach_id ?? undefined,
    referredPlayerId: r.referred_player_id ?? undefined, referredName: r.referred_name,
    commissionType: r.commission_type as ReferralCommissionType,
    oneOffAmountAud: r.one_off_amount_aud ?? undefined, ongoingRatePercent: r.ongoing_rate_percent ?? undefined,
    ongoingRevenueSource: (r.ongoing_revenue_source as ReferralRevenueSource) ?? undefined,
    ongoingEndDate: r.ongoing_end_date ?? undefined, status: r.status as ReferralStatus,
    notes: r.notes ?? undefined, createdAt: r.created_at, createdBy: r.created_by,
  };
}

export function dbToReferralPayout(r: DbReferralPayout): ReferralPayout {
  return {
    id: r.id, referralId: r.referral_id, periodLabel: r.period_label ?? undefined,
    amountAud: r.amount_aud, status: r.status as ReferralPayoutStatus,
    paidDate: r.paid_date ?? undefined, paidBy: r.paid_by ?? undefined, createdAt: r.created_at,
  };
}

export async function fetchReferrals(): Promise<Referral[]> {
  const sb = createClient();
  const { data, error } = await sb.from("referrals").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbReferral[]).map(dbToReferral);
}

export async function fetchReferralPayouts(referralId?: string): Promise<ReferralPayout[]> {
  const sb = createClient();
  let q = sb.from("referral_payouts").select("*").order("created_at", { ascending: false });
  if (referralId) q = q.eq("referral_id", referralId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as DbReferralPayout[]).map(dbToReferralPayout);
}

// ─── Platform fee dues (cash/bank-transfer packs) ──────────────────────────

export interface DbPackFeeDue {
  id: string; pack_id: string; academy_id: string; amount_aud: number; fee_percent: number;
  status: string; collected_date?: string | null; collected_by?: string | null; created_at?: string;
}

export function dbToPackFeeDue(r: DbPackFeeDue): PackFeeDue {
  return {
    id: r.id, packId: r.pack_id, academyId: r.academy_id, amountAud: r.amount_aud, feePercent: r.fee_percent,
    status: r.status as PackFeeDueStatus, collectedDate: r.collected_date ?? undefined,
    collectedBy: r.collected_by ?? undefined, createdAt: r.created_at,
  };
}

export async function fetchPackFeeDues(): Promise<PackFeeDue[]> {
  const sb = createClient();
  const { data, error } = await sb.from("pack_fee_dues").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbPackFeeDue[]).map(dbToPackFeeDue);
}

export interface DbBookingFeeDue {
  id: string; booking_id: string; academy_id: string; amount_aud: number; fee_percent: number;
  status: string; collected_date?: string | null; collected_by?: string | null; created_at?: string;
}

export function dbToBookingFeeDue(r: DbBookingFeeDue): BookingFeeDue {
  return {
    id: r.id, bookingId: r.booking_id, academyId: r.academy_id, amountAud: r.amount_aud, feePercent: r.fee_percent,
    status: r.status as PackFeeDueStatus, collectedDate: r.collected_date ?? undefined,
    collectedBy: r.collected_by ?? undefined, createdAt: r.created_at,
  };
}

export async function fetchBookingFeeDues(): Promise<BookingFeeDue[]> {
  const sb = createClient();
  const { data, error } = await sb.from("booking_fee_dues").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbBookingFeeDue[]).map(dbToBookingFeeDue);
}
