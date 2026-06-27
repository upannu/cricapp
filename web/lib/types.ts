export type PlanTier = 'Coach Pro' | 'Player Pro' | 'Free';
export type PlayerStatus = 'Active' | 'Expiring' | 'Expired';
export type BowlingStyle =
  | 'Right Arm Fast'
  | 'Left Arm Fast'
  | 'Right Arm Fast-Medium'
  | 'Left Arm Fast-Medium'
  | 'Right Arm Medium'
  | 'Left Arm Medium';
export type AgeGroup = 'U14' | 'U16' | 'U19' | 'Senior';
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

export interface Player {
  id: string;
  name: string;
  bowlingStyle: BowlingStyle;
  addedDate: string;
  email: string;
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
