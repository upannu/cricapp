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

export type UserRole = 'platform_admin' | 'academy_admin' | 'coach';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  approved: boolean;
  academyId?: string;
  coachId?: string;
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
}

export type SessionType =
  | 'Net Session'
  | 'Match Practice'
  | 'Individual Drill'
  | 'Warm-up / Conditioning'
  | 'Video Review';

export interface SessionVideo {
  angle: 'front' | 'side' | 'back';
  label: string;
  url?: string;
}

export interface Session {
  id: string;
  playerId: string;
  date: string;
  type: SessionType;
  notes: string;
  videos: SessionVideo[];
  ballSpeedKmh: number | null;
  frontKneeAngleDeg: number | null;
  xpEarned: number;
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
  coachAssigned: string;
  guardianConsentStatus: GuardianConsent;
  subscription: Subscription;
  biomechanics: BiomechanicsData;
  academy: AcademyProgress;
  sessionsCount: number;
  lastActive: string;
  xp: number;
}
