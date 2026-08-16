export type PlanTier = 'Coach Pro' | 'Player Pro' | 'Free';

/** Platform-wide subscription prices, editable by a platform admin — see /admin/pricing. */
export interface PlatformSettings {
  playerProPriceAud: number;
  coachProPriceAud: number;
}

/**
 * A row in the configurable plan catalog (Library, Individual Assessment, Academy/Club/Board
 * licenses) — editable by a platform admin at /admin/plans, separate from the fixed Player Pro /
 * Coach Pro pricing above. `accessDurationMonths` and `includedNotes` only apply to plans whose
 * software access window is shorter than their billing period (e.g. the board tier: billed
 * yearly, access lasts 3 months).
 */
export interface Plan {
  id: string;
  slug: string;
  name: string;
  audience: 'individual' | 'organization';
  billingType: 'subscription' | 'one_time';
  billingInterval: 'month' | 'year' | null;
  priceAud: number;
  seatCap: number | null;
  accessDurationMonths: number | null;
  includedNotes: string | null;
  /** Players at an academy on this plan never pay a session fee for bookings/packs — the
   * academy's own subscription covers it (e.g. a cricket board license). */
  waivesSessionFees: boolean;
  active: boolean;
  sortOrder: number;
}
export type PlayerStatus = 'Active' | 'Expiring' | 'Expired';
export type BowlingStyle =
  | 'Right Arm Fast'
  | 'Left Arm Fast'
  | 'Right Arm Fast-Medium'
  | 'Left Arm Fast-Medium'
  | 'Right Arm Medium'
  | 'Left Arm Medium';
export type AgeGroup = 'U10' | 'U11' | 'U12' | 'U13' | 'U14' | 'U16' | 'U19' | 'Senior';
export type PlayingLevel = 'Beginner' | 'Club' | 'Representative' | 'State' | 'National' | 'International';
export type BattingHand = 'Right Hand' | 'Left Hand';
export type ActionType = 'Side-on' | 'Front-on' | 'Mixed';
export type InjuryRisk = 'Low' | 'Moderate' | 'High';
export type AcademyStage = 'Foundation' | 'Mechanics' | 'Velocity' | 'Elite';
export type GuardianConsent = 'Confirmed' | 'Pending' | 'N/A';

export interface Subscription {
  plan: PlanTier;
  startDate: string;
  endDate: string;
  sessionsUsed: number;
  sessionsLimit: number | null;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  /** Stripe's own subscription status (active, past_due, canceled, ...) — the webhook-driven source of truth, not `plan` alone. */
  subscriptionStatus?: string;
}

export interface BiomechanicsData {
  ballSpeedKmh: number;
  frontKneeAngleDeg: number;
  actionType: ActionType;
  injuryRisk: InjuryRisk;
  lastSession: string;
}

export interface AcademyProgress {
  stage: AcademyStage;
  completionPercent: number;
  totalSessions: number;
  xp: number;
  articlesRead: number;
}

export type ArticleCategory = 'Biomechanical' | 'Technical' | 'Physical' | 'Mental' | 'Data Insight';

export interface Article {
  id: string;
  stage: AcademyStage;
  orderInStage: number;
  title: string;
  readTimeMinutes: number;
  relatedMetric?: string;
  keyTakeaways: string[];
  bodyMd: string;
  published: boolean;
  /** Optional embed URL (YouTube/Vimeo/direct file) shown above the article body. */
  videoUrl?: string;
}

export interface DailyTip {
  id: string;
  publishDate: string;
  category: ArticleCategory;
  body: string;
  relatedArticleId?: string;
}

export interface ArticleRead {
  id: string;
  playerId: string;
  articleId: string;
  readAt: string;
}

export const PLATFORM_FEE_PCT = 0.10;

export interface Academy {
  id: string;
  name: string;
  description: string;
  location: string;
  playerCounts: Partial<Record<AgeGroup, number>>;
  playerIds: string[];
  coachIds: string[];
  headCoachId: string;
  stage: AcademyStage;
  coachName: string;
  startDate: string;
  status: 'Active' | 'Inactive';
  sessionFeeAud: number;
  sessionTypeFees: Partial<Record<BookingType, number>>;
  ageFees: Partial<Record<AgeGroup, number>>;
  /** Org-level billing (Academy/Club/Board license) — separate from the per-session fees above. */
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
  planId?: string;
  /** Only meaningful when the active plan has accessDurationMonths set (e.g. the board tier). */
  accessExpiresAt?: string;
  /** 'head_coach' (default): all booking/pack revenue pays out to headCoachId. 'split_by_coach':
   * each booking/pack pays out to its own coach directly. */
  payoutModel: 'head_coach' | 'split_by_coach';
}

export type UserRole = 'platform_admin' | 'academy_admin' | 'coach' | 'player' | 'parent';

export interface LinkedIdentity {
  role: UserRole;
  academyId?: string;
  coachId?: string;
  playerId?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  approved: boolean;
  academyId?: string;
  coachId?: string;
  playerId?: string;
  /** Other role identities linked to this same account (e.g. also a parent, also a coach) —
   * includes the currently active one. Only present when there's more than one. */
  linkedIdentities?: LinkedIdentity[];
}

export type PaymentStatus = 'Paid' | 'Pending' | 'Overdue';

export interface SessionPack {
  id: string;
  playerId: string;
  academyId: string;
  /** The coach this pack's revenue belongs to when the academy is in split-payout mode — a pack
   * has no single naturally-owning coach the way a booking does (it funds group sessions that may
   * be run by whichever coach), so this is set explicitly at creation rather than inferred. */
  coachId?: string;
  sessionType: BookingType;
  purchaseDate: string;
  totalSessions: number;
  sessionsUsed: number;
  sessionCredits: number;
  feePerSession: number;
  status: 'Active' | 'Exhausted';
  paymentStatus: PaymentStatus;
  paymentDueDate: string;
  agreedDays: string[];
}

/** A recurring weekly group coaching session (e.g. "U14 Tuesday Nets") — attendance is taken
 * per dated occurrence, drawing down each present player's own SessionPack. */
export interface GroupSession {
  id: string;
  academyId: string;
  coachId: string;
  name: string;
  sessionType: BookingType;
  /** 0 = Sunday .. 6 = Saturday */
  dayOfWeek: number;
  time: string;
  durationMins: number;
  location: string;
  active: boolean;
  playerIds: string[];
}

export type AttendanceStatus = 'Present' | 'Absent';

export interface AttendanceRecord {
  id: string;
  occurrenceId: string;
  playerId: string;
  status: AttendanceStatus;
  /** Set only when this attendance actually drew down a SessionPack session. */
  packId: string | null;
  recordedAt: string;
}

export type MessageChannel = 'email' | 'sms';

export interface Message {
  id: string;
  playerId: string;
  fromName: string;
  date: string;
  channel: MessageChannel;
  subject: string;
  body: string;
}

export type ReportType = 'Biomechanics' | 'Session Review' | 'Progress Report' | 'Action Plan';

export interface ReportMetric {
  id: string;
  label: string;
  zone: 'approach' | 'deliveryStride' | 'release' | 'followThrough';
  value: number | null;
  unit: string;
  idealRange?: [number, number];
  score: number | null;
}

export interface ReportBiomechanics {
  phases: {
    backFootContactSec: number | null;
    frontFootContactSec: number | null;
    peakLoadSec: number | null;
    releaseSec: number | null;
    followThroughSec: number | null;
  };
  metrics: ReportMetric[];
  zoneScores: Record<'approach' | 'deliveryStride' | 'release' | 'followThrough', number | null>;
  flags: string[];
  flaggedMetricIds: string[];
  overallScore: number | null;
  disclaimer: string;
}

export interface ReportDrill {
  id: string;
  name: string;
  focus: string;
  description: string;
}

export type PitchLengthZone = 'Full Toss' | 'Yorker' | 'Full' | 'Good Length' | 'Short' | 'Bouncer';
export type PitchLine = 'Off side' | 'Middle' | 'Leg side';

export interface BallTrackingResult {
  measured: boolean;
  confidence: 'high' | 'low' | 'none';
  speedKmh: number | null;
  bounceLengthZone: PitchLengthZone | null;
  bounceLineApprox: PitchLine | null;
  pitchMapImageUrl: string | null;
  note?: string;
}

export interface CameraCalibration {
  id: string;
  academyId: string;
  angle: 'front' | 'side' | 'back';
  point1: { x: number; y: number };
  point2: { x: number; y: number };
  referenceDistanceM: number;
  frameWidth: number;
  frameHeight: number;
}

export interface SkeletonImage {
  phase: 'backFootContact' | 'frontFootContact' | 'peakLoad' | 'release' | 'followThrough';
  url: string;
}

export interface Report {
  id: string;
  playerId: string;
  date: string;
  type: ReportType;
  summary: string;
  speedKmh: number | null;
  frontKneeAngleDeg: number | null;
  tags: string[];
  highlight?: string;
  sessionId?: string;
  sessionDate?: string;
  actionType?: ActionType;
  injuryRisk?: InjuryRisk;
  overallScore?: number | null;
  angleUsed?: 'front' | 'side' | 'back';
  metrics?: ReportBiomechanics;
  skeletonImages?: SkeletonImage[];
  drills?: ReportDrill[];
  ballTracking?: BallTrackingResult;
}

export type CoachStatus = 'Active' | 'Inactive';
export type CertificationLevel = 'Level 1' | 'Level 2' | 'Level 3' | 'Elite';

export interface Coach {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialization: string;
  ageGroupsFocus: AgeGroup[];
  location: string;
  status: CoachStatus;
  joinedDate: string;
  certificationLevel: CertificationLevel;
  bio: string;
  academyId: string;
  marketplaceVisible: boolean;
  /** Directory-listing "actively taking new players" toggle — distinct from `status` (Active/Inactive on the platform). */
  available: boolean;
  stripeConnectAccountId?: string;
  stripeConnectOnboarded: boolean;
  /** Geocoded from `location` on save — absent until the geocoding API has resolved it at least once. */
  lat?: number;
  lng?: number;
}

export type BookingStatus = 'Confirmed' | 'Pending' | 'Cancelled' | 'Completed';
export type BookingType =
  | 'Net Session'
  | 'Individual Coaching'
  | 'Video Review'
  | 'Fitness Assessment'
  | 'Match Practice'
  | 'Warm-up / Conditioning';

export interface Booking {
  id: string;
  playerId: string;
  coachId: string;
  date: string;
  time: string;
  durationMins: number;
  type: BookingType;
  status: BookingStatus;
  location: string;
  notes: string;
  feeAud: number;
  packId?: string;
  /** Set when a player submitted this via the coach marketplace, rather than staff creating it directly. */
  source?: 'marketplace';
  /** Only meaningful when there's no `packId` — a pack-drawn booking is already paid for via the pack. */
  paymentStatus: PaymentStatus;
}

export interface SessionVideo {
  angle: 'front' | 'side' | 'back';
  label: string;
  url?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  fps?: number | null;
  transcoded?: boolean;
}

export interface Session {
  id: string;
  playerId: string;
  date: string;
  type: BookingType;
  notes: string;
  videos: SessionVideo[];
  ballSpeedKmh: number | null;
  frontKneeAngleDeg: number | null;
  xpEarned: number;
  bookingId?: string;
  /** Rate of Perceived Exertion, 1 (very easy) - 10 (maximal effort) — logged by the coach or the player. */
  rpe?: number | null;
}

export interface Player {
  id: string;
  name: string;
  bowlingStyle: BowlingStyle;
  battingHand: BattingHand;
  playingLevel: PlayingLevel;
  heightCm: number | null;
  weightKg: number | null;
  addedDate: string;
  email: string;
  phone: string;
  ageGroup: AgeGroup;
  club: string;
  coachId: string;
  guardianConsentStatus: GuardianConsent;
  guardianConsentConfirmedAt?: string;
  guardianConsentConfirmedBy?: string;
  guardianConsentConfirmedEmail?: string;
  subscription: Subscription;
  biomechanics: BiomechanicsData;
  academy: AcademyProgress;
  sessionsCount: number;
  lastActive: string;
  xp: number;
  tipStreakCount: number;
  tipBestStreak: number;
  /** Independent of `subscription.plan` — a player can hold Library access without Player Pro. */
  libraryStripeSubscriptionId?: string;
  librarySubscriptionStatus?: string | null;
  /** One-time-purchased AI report credits, consumed outside the subscription session cap. */
  assessmentCredits: number;
}

// ─── Coach workflow: action plans, video annotation, voice notes, assessments ──

export type ActionPlanPriority = 'High' | 'Medium' | 'Low';
export type ActionPlanStatus = 'Pending' | 'In Progress' | 'Completed';

export interface ActionPlan {
  id: string;
  playerId: string;
  title: string;
  priority: ActionPlanPriority;
  status: ActionPlanStatus;
  dueDate: string;
  drills: string[];
  notes: string;
  createdAt?: string;
}

// ─── S&C (strength & conditioning) manual workout log ──────────────────────────

export type SCWorkoutType = 'Strength' | 'Conditioning' | 'Speed & Agility' | 'Mobility' | 'Recovery';

export interface SCWorkout {
  id: string;
  playerId: string;
  date: string;
  workoutType: SCWorkoutType;
  durationMins: number;
  /** Rate of Perceived Exertion, 1 (very easy) - 10 (maximal effort). */
  rpe: number;
  notes: string;
  createdAt?: string;
}

export interface VideoAnnotation {
  id: string;
  sessionId: string;
  playerId: string;
  angle: 'front' | 'side' | 'back';
  timestampSec: number;
  imageUrl: string;
  note: string;
  createdAt?: string;
}

export interface VoiceNote {
  id: string;
  sessionId?: string;
  playerId: string;
  audioUrl: string;
  transcript: string;
  durationSec: number | null;
  createdAt?: string;
}

export const ASSESSMENT_CATEGORIES = [
  'approach',
  'deliveryStride',
  'releaseFollowThrough',
  'fitness',
  'attitude',
] as const;
export type AssessmentCategory = typeof ASSESSMENT_CATEGORIES[number];

export interface Assessment {
  id: string;
  sessionId?: string;
  playerId: string;
  coachId?: string;
  ratings: Partial<Record<AssessmentCategory, number>>;
  comments: Partial<Record<AssessmentCategory, string>>;
  overallRecommendation: string;
  createdAt?: string;
}
