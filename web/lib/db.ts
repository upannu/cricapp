import { createClient } from "@/lib/supabase";
import type {
  Player, Coach, Academy, Booking, Session, SessionPack, Message, Report,
  BowlingStyle, AgeGroup, GuardianConsent, PlanTier, ActionType,
  InjuryRisk, AcademyStage, BookingType, BookingStatus, MessageChannel,
} from "@/lib/types";

// ─── DB row types (snake_case from Postgres) ────────────────────────────────

export interface DbPlayer {
  id: string; name: string; email: string; phone: string;
  bowling_style: string; age_group: string; club: string;
  coach_assigned: string; guardian_consent_status: string;
  added_date: string; sessions_count: number; last_active: string; xp: number;
  sub_plan: string; sub_start_date: string; sub_end_date: string;
  sub_sessions_used: number; sub_sessions_limit: number | null;
  bio_ball_speed_kmh: number; bio_front_knee_angle_deg: number;
  bio_action_type: string; bio_injury_risk: string; bio_last_session: string;
  acad_stage: string; acad_completion_percent: number;
  acad_total_sessions: number; acad_xp: number; acad_articles_read: number;
}

export interface DbCoach {
  id: string; name: string; email: string; phone: string;
  specialization: string; age_groups_focus: string[]; location: string;
  status: string; joined_date: string; certification_level: string;
  bio: string; academy_id: string;
}

export interface DbAcademy {
  id: string; name: string; description: string; location: string;
  player_ids: string[]; player_counts: Record<string, number>;
  stage: string; coach_name: string; start_date: string; status: string;
  session_fee_aud: number; session_type_fees: Record<string, number>;
}

export interface DbBooking {
  id: string; player_id: string; coach_id: string; date: string;
  time: string; duration_mins: number; type: string; status: string;
  location: string; notes: string; fee_aud: number;
}

export interface DbSession {
  id: string; player_id: string; date: string; type: string;
  notes: string; videos: Array<{ angle: string; label: string }>;
  ball_speed_kmh: number | null; front_knee_angle_deg: number | null;
  xp_earned: number;
}

export interface DbSessionPack {
  id: string; player_id: string; academy_id: string; session_type: string;
  purchase_date: string; total_sessions: number; sessions_used: number;
  session_credits: number; fee_per_session: number; status: string;
  payment_status: string; payment_due_date: string;
}

export interface DbReport {
  id: string; player_id: string; date: string; type: string;
  summary: string; speed_kmh: number | null; front_knee_angle_deg: number | null;
  tags: string[]; highlight: string | null;
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
    club: r.club, coachAssigned: r.coach_assigned,
    guardianConsentStatus: r.guardian_consent_status as GuardianConsent,
    addedDate: r.added_date, sessionsCount: r.sessions_count,
    lastActive: r.last_active, xp: r.xp,
    subscription: {
      plan: r.sub_plan as PlanTier,
      startDate: r.sub_start_date, endDate: r.sub_end_date,
      sessionsUsed: r.sub_sessions_used, sessionsLimit: r.sub_sessions_limit,
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
    bio: r.bio, academyId: r.academy_id,
  };
}

export function dbToAcademy(r: DbAcademy): Academy {
  return {
    id: r.id, name: r.name, description: r.description, location: r.location,
    playerIds: r.player_ids ?? [],
    playerCounts: r.player_counts as Academy["playerCounts"],
    stage: r.stage as AcademyStage,
    coachName: r.coach_name, startDate: r.start_date,
    status: r.status as "Active" | "Inactive",
    sessionFeeAud: r.session_fee_aud,
    sessionTypeFees: r.session_type_fees as Academy["sessionTypeFees"],
  };
}

export function dbToBooking(r: DbBooking): Booking {
  return {
    id: r.id, playerId: r.player_id, coachId: r.coach_id,
    date: r.date, time: r.time, durationMins: r.duration_mins,
    type: r.type as BookingType, status: r.status as BookingStatus,
    location: r.location, notes: r.notes, feeAud: r.fee_aud,
  };
}

export function dbToSession(r: DbSession): Session {
  return {
    id: r.id, playerId: r.player_id, date: r.date,
    type: r.type as Session["type"], notes: r.notes,
    videos: (r.videos ?? []).map((v) => ({ ...v, angle: v.angle as "front" | "side" | "back" })),
    ballSpeedKmh: r.ball_speed_kmh, frontKneeAngleDeg: r.front_knee_angle_deg,
    xpEarned: r.xp_earned,
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
  };
}

export function dbToReport(r: DbReport): Report {
  return {
    id: r.id, playerId: r.player_id, date: r.date,
    type: r.type as Report["type"], summary: r.summary,
    speedKmh: r.speed_kmh, frontKneeAngleDeg: r.front_knee_angle_deg,
    tags: r.tags ?? [], highlight: r.highlight ?? undefined,
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

export async function fetchPlayers(coachName?: string, academyId?: string): Promise<Player[]> {
  const sb = createClient();
  let q = sb.from("players").select("*").order("name");
  if (coachName) q = q.eq("coach_assigned", coachName);
  const { data, error } = await q;
  if (error) throw error;
  return (data as DbPlayer[]).map(dbToPlayer);
}

export async function fetchPlayer(id: string): Promise<Player | null> {
  const sb = createClient();
  const { data } = await sb.from("players").select("*").eq("id", id).single();
  return data ? dbToPlayer(data as DbPlayer) : null;
}

export async function updatePlayer(id: string, edits: Partial<DbPlayer>): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("players").update(edits).eq("id", id);
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

export async function insertReport(r: Omit<DbReport, "id"> & { id: string }): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("reports").insert(r);
  if (error) throw error;
}
