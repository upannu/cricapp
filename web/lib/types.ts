export type PlanTier = 'Coach Pro' | 'Player Pro' | 'Free';
export type PlayerStatus = 'Active' | 'Expiring' | 'Expired';
export type BowlingStyle =
  | 'Right Arm Fast'
  | 'Left Arm Fast'
  | 'Right Arm Fast-Medium'
  | 'Left Arm Fast-Medium'
  | 'Right Arm Medium'
  | 'Left Arm Medium';
export type AgeGroup = 'U10' | 'U11' | 'U12' | 'U13' | 'U14' | 'U16' | 'U19' | 'Senior';
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
}

export type UserRole = 'platform_admin' | 'academy_admin' | 'coach' | 'player' | 'parent';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  approved: boolean;
  academyId?: string;
  coachId?: string;
  playerId?: string;
}

export type PaymentStatus = 'Paid' | 'Pending' | 'Overdue';

export interface SessionPack {
  id: string;
  playerId: string;
  academyId: string;
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
  phase: 'backFootContact' | 'frontFootContact' | 'release' | 'followThrough';
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
}

export interface Player {
  id: string;
  name: string;
  bowlingStyle: BowlingStyle;
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
