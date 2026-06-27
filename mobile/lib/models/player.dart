enum SubscriptionStatus { active, expiring, expired }

class Subscription {
  final String plan;
  final String startDate;
  final String endDate;
  final int sessionsUsed;
  final int? sessionsLimit;

  const Subscription({
    required this.plan,
    required this.startDate,
    required this.endDate,
    required this.sessionsUsed,
    this.sessionsLimit,
  });
}

class BiomechanicsData {
  final double ballSpeedKmh;
  final int frontKneeAngleDeg;
  final String actionType;
  final String injuryRisk;
  final String lastSession;

  const BiomechanicsData({
    required this.ballSpeedKmh,
    required this.frontKneeAngleDeg,
    required this.actionType,
    required this.injuryRisk,
    required this.lastSession,
  });
}

class AcademyProgress {
  final String stage;
  final int completionPercent;
  final int totalSessions;
  final int xp;
  final int articlesRead;

  const AcademyProgress({
    required this.stage,
    required this.completionPercent,
    required this.totalSessions,
    required this.xp,
    required this.articlesRead,
  });
}

class Player {
  final String id;
  final String name;
  final String bowlingStyle;
  final String addedDate;
  final String email;
  final String ageGroup;
  final String club;
  final String coachAssigned;
  final String guardianConsentStatus;
  final Subscription subscription;
  final BiomechanicsData biomechanics;
  final AcademyProgress academy;
  final int sessionsCount;
  final String lastActive;
  final int xp;

  const Player({
    required this.id,
    required this.name,
    required this.bowlingStyle,
    required this.addedDate,
    required this.email,
    required this.ageGroup,
    required this.club,
    required this.coachAssigned,
    required this.guardianConsentStatus,
    required this.subscription,
    required this.biomechanics,
    required this.academy,
    required this.sessionsCount,
    required this.lastActive,
    required this.xp,
  });

  static SubscriptionStatus getStatus(String endDate) {
    final now = DateTime.now();
    final end = DateTime.parse(endDate);
    final diff = end.difference(now).inDays;
    if (diff < 0) return SubscriptionStatus.expired;
    if (diff <= 7) return SubscriptionStatus.expiring;
    return SubscriptionStatus.active;
  }

  String get initials => name
      .split(' ')
      .where((w) => w.isNotEmpty)
      .map((w) => w[0])
      .join();
}
