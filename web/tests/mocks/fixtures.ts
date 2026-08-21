import type {
  Academy, ActionPlan, AuthUser, Coach, GroupSession, Player, Report, SCWorkout, Session, SessionPack,
} from "@/lib/types";

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function makePlayer(overrides: Partial<Player> = {}): Player {
  const id = overrides.id ?? nextId("player");
  return {
    id,
    name: "Test Player",
    bowlingStyle: "Right Arm Fast",
    battingHand: "Right Hand",
    playingLevel: "Club",
    heightCm: null,
    weightKg: null,
    addedDate: "2026-01-01",
    email: "player@example.com",
    phone: "",
    ageGroup: "Senior",
    club: "",
    coachId: "",
    guardianConsentStatus: "N/A",
    subscription: {
      plan: "Free",
      startDate: "2026-01-01",
      endDate: "2027-01-01",
      sessionsUsed: 0,
      sessionsLimit: 4,
    },
    biomechanics: {
      ballSpeedKmh: 0,
      frontKneeAngleDeg: 0,
      actionType: "Side-on",
      injuryRisk: "Low",
      lastSession: "",
    },
    academy: { stage: "Foundation", completionPercent: 0, totalSessions: 0, xp: 0, articlesRead: 0 },
    sessionsCount: 0,
    lastActive: "2026-01-01",
    xp: 0,
    tipStreakCount: 0,
    tipBestStreak: 0,
    assessmentCredits: 0,
    loginDisabled: false,
    disabledAt: null,
    disabledReason: null,
    ...overrides,
  };
}

export function makeCoach(overrides: Partial<Coach> = {}): Coach {
  return {
    id: nextId("coach"),
    name: "Test Coach",
    email: "coach@example.com",
    phone: "",
    specialization: "",
    ageGroupsFocus: ["Senior"],
    location: "",
    status: "Active",
    joinedDate: "2026-01-01",
    certificationLevel: "Level 1",
    bio: "",
    academyId: "",
    marketplaceVisible: false,
    available: true,
    stripeConnectOnboarded: false,
    ...overrides,
  };
}

export function makeAcademy(overrides: Partial<Academy> = {}): Academy {
  return {
    id: nextId("academy"),
    name: "Test Academy",
    description: "",
    location: "",
    playerCounts: {},
    playerIds: [],
    coachIds: [],
    headCoachId: "",
    stage: "Foundation",
    coachName: "",
    startDate: "2026-01-01",
    status: "Active",
    sessionFeeAud: 0,
    sessionTypeFees: {},
    ageFees: {},
    payoutModel: "head_coach",
    ...overrides,
  };
}

export function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: nextId("report"),
    playerId: "player-1",
    date: "2026-01-01",
    type: "Biomechanics",
    summary: "Solid session.",
    speedKmh: 120,
    frontKneeAngleDeg: 170,
    tags: [],
    ...overrides,
  };
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: nextId("session"),
    playerId: "player-1",
    date: "2026-01-01",
    type: "Net Session",
    notes: "",
    videos: [],
    ballSpeedKmh: null,
    frontKneeAngleDeg: null,
    xpEarned: 0,
    ...overrides,
  };
}

export function makeActionPlan(overrides: Partial<ActionPlan> = {}): ActionPlan {
  return {
    id: nextId("ap"),
    playerId: "player-1",
    title: "Test Plan",
    priority: "Medium",
    status: "Pending",
    dueDate: "",
    drills: ["Wall Drill"],
    notes: "Some notes.",
    ...overrides,
  };
}

export function makeSCWorkout(overrides: Partial<SCWorkout> = {}): SCWorkout {
  return {
    id: nextId("sc"),
    playerId: "player-1",
    date: "2026-01-01",
    workoutType: "Strength",
    durationMins: 45,
    rpe: 5,
    notes: "",
    ...overrides,
  };
}

export function makeGroupSession(overrides: Partial<GroupSession> = {}): GroupSession {
  return {
    id: nextId("gs"),
    academyId: "academy-1",
    coachId: "coach-1",
    name: "Test Group",
    sessionType: "Net Session",
    dayOfWeek: 2,
    time: "16:00",
    durationMins: 60,
    location: "",
    active: true,
    playerIds: [],
    ...overrides,
  };
}

export function makeSessionPack(overrides: Partial<SessionPack> = {}): SessionPack {
  return {
    id: nextId("pack"),
    playerId: "player-1",
    academyId: "academy-1",
    sessionType: "Net Session",
    purchaseDate: "2026-01-01",
    totalSessions: 10,
    sessionsUsed: 0,
    sessionCredits: 10,
    feePerSession: 20,
    status: "Active",
    paymentStatus: "Paid",
    paymentDueDate: "2026-01-01",
    paidDate: null,
    agreedDays: [],
    ...overrides,
  };
}

export function makeAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: nextId("user"),
    name: "Test User",
    email: "user@example.com",
    role: "platform_admin",
    approved: true,
    ...overrides,
  };
}
