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
} from "@/lib/types";
import { STAGE_ORDER, XP_PER_ARTICLE, STAGE_COMPLETE_BONUS_XP, ALL_ARTICLES_BONUS_XP, ACADEMY_TOTAL_ARTICLES, TIP_STREAK_BONUS_XP, TIP_STREAK_TARGET_DAYS, currentUnlockedStage } from "@/lib/academy-content";

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
  bio_ball_speed_kmh: number; bio_front_knee_angle_deg: number;
  bio_action_type: string; bio_injury_risk: string; bio_last_session: string;
  acad_stage: string; acad_completion_percent: number;
  acad_total_sessions: number; acad_xp: number; acad_articles_read: number;
  tip_streak_count?: number; tip_best_streak?: number; tip_last_viewed_date?: string | null;
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
}

export interface DbAcademy {
  id: string; name: string; description: string; location: string;
  player_ids: string[]; player_counts: Record<string, number>;
  coach_ids: string[]; head_coach_id: string;
  stage: string; coach_name: string; start_date: string; status: string;
  session_fee_aud: number; session_type_fees: Record<string, number>;
  age_fees: Record<string, number>;
}

export interface DbBooking {
  id: string; player_id: string; coach_id: string; date: string;
  time: string; duration_mins: number; type: string; status: string;
  location: string; notes: string; fee_aud: number; pack_id?: string | null;
  source?: string | null;
  payment_status?: string;
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
  id: string; player_id: string; academy_id: string; session_type: string;
  purchase_date: string; total_sessions: number; sessions_used: number;
  session_credits: number; fee_per_session: number; status: string;
  payment_status: string; payment_due_date: string; agreed_days?: string[];
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
  };
}

export function dbToAcademy(r: DbAcademy): Academy {
  return {
    id: r.id, name: r.name, description: r.description, location: r.location,
    playerIds: r.player_ids ?? [],
    playerCounts: r.player_counts as Academy["playerCounts"],
    coachIds: (r.coach_ids ?? []) as string[],
    headCoachId: r.head_coach_id ?? "",
    stage: r.stage as AcademyStage,
    coachName: r.coach_name, startDate: r.start_date,
    status: r.status as "Active" | "Inactive",
    sessionFeeAud: r.session_fee_aud,
    sessionTypeFees: r.session_type_fees as Academy["sessionTypeFees"],
    ageFees: (r.age_fees ?? {}) as Academy["ageFees"],
  };
}

export function dbToBooking(r: DbBooking): Booking {
  return {
    id: r.id, playerId: r.player_id, coachId: r.coach_id,
    date: r.date, time: r.time, durationMins: r.duration_mins,
    type: r.type as BookingType, status: r.status as BookingStatus,
    location: r.location, notes: r.notes, feeAud: r.fee_aud,
    packId: r.pack_id ?? undefined,
    source: (r.source as Booking["source"]) ?? undefined,
    paymentStatus: (r.payment_status as PaymentStatus) ?? "Pending",
  };
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
    sessionType: r.session_type as BookingType,
    purchaseDate: r.purchase_date, totalSessions: r.total_sessions,
    sessionsUsed: r.sessions_used, sessionCredits: r.session_credits,
    feePerSession: r.fee_per_session,
    status: r.status as "Active" | "Exhausted",
    paymentStatus: r.payment_status as SessionPack["paymentStatus"],
    paymentDueDate: r.payment_due_date,
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

export async function deleteCoach(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("coaches").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertAcademy(a: Partial<DbAcademy> & { id: string }): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("academies").upsert(a);
  if (error) throw error;
}

export async function deleteAcademy(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("academies").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchBookings(coachId?: string, playerId?: string): Promise<Booking[]> {
  const sb = createClient();
  let q = sb.from("bookings").select("*").order("date", { ascending: false });
  if (coachId) q = q.eq("coach_id", coachId);
  if (playerId) q = q.eq("player_id", playerId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as DbBooking[]).map(dbToBooking);
}

export async function upsertBooking(b: Partial<DbBooking> & { id: string }): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("bookings").upsert(b);
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
  const sb = createClient();
  let q = sb.from("sessions").select("*").order("date", { ascending: false });
  if (playerIds?.length) q = q.in("player_id", playerIds);
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

export async function fetchReports(playerId?: string): Promise<Report[]> {
  const sb = createClient();
  let q = sb.from("reports").select("*").order("date", { ascending: false });
  if (playerId) q = q.eq("player_id", playerId);
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
    sb.from("players").select("xp, acad_xp, acad_articles_read, sub_plan").eq("id", playerId).single(),
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
  const newStage = currentUnlockedStage(playerRow.sub_plan as PlanTier, readCountByStage);

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
