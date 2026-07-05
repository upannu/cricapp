import { createClient } from "@/lib/supabase";
import type {
  Player, Coach, Academy, Booking, Session, SessionPack, Message, Report,
  BowlingStyle, AgeGroup, GuardianConsent, PlanTier, ActionType,
  InjuryRisk, AcademyStage, BookingType, BookingStatus, MessageChannel,
  ReportBiomechanics, SkeletonImage, ReportDrill, BallTrackingResult, CameraCalibration,
  ActionPlan, ActionPlanPriority, ActionPlanStatus,
  VideoAnnotation, VoiceNote, Assessment, AssessmentCategory,
} from "@/lib/types";

// ─── DB row types (snake_case from Postgres) ────────────────────────────────

export interface DbPlayer {
  id: string; name: string; email: string; phone: string;
  bowling_style: string; age_group: string; club: string;
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
}

export interface DbCoach {
  id: string; name: string; email: string; phone: string;
  specialization: string; age_groups_focus: string[]; location: string;
  status: string; joined_date: string; certification_level: string;
  bio: string; academy_id: string | null;
  marketplace_visible: boolean;
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
    ageGroup: r.age_group as AgeGroup,
    club: r.club, coachId: r.coach_id ?? "",
    guardianConsentStatus: r.guardian_consent_status as GuardianConsent,
    guardianConsentConfirmedAt: r.guardian_consent_confirmed_at ?? undefined,
    guardianConsentConfirmedBy: r.guardian_consent_confirmed_by ?? undefined,
    guardianConsentConfirmedEmail: r.guardian_consent_confirmed_email ?? undefined,
    addedDate: r.added_date, sessionsCount: r.sessions_count,
    lastActive: r.last_active, xp: r.xp,
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

/** Was never actually happening — a session's xpEarned was inserted onto the session row but never added to the player's running total or their monthly session count. */
export async function recordSessionCompletion(playerId: string, xpEarned: number): Promise<void> {
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
      sub_sessions_used: (data.sub_sessions_used ?? 0) + 1,
    })
    .eq("id", playerId);
  if (error) throw error;
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
